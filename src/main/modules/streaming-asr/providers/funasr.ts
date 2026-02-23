import WebSocket from 'ws'
import { spawn, ChildProcess } from 'child_process'
import { BaseASRProvider } from './base.js'
import { ASRProviderConfig, ASRCallbacks, AudioChunk } from '../types.js'
import { StreamingASRResult, StreamingASRStatus, StreamingASRError } from '@shared/types'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

/**
 * FunASR 本地流式语音识别提供商
 * 使用 WebSocket 连接到本地 FunASR 服务
 */
export class FunASRProvider extends BaseASRProvider {
  private ws: WebSocket | null = null
  private isConnected = false
  private funasrProcess: ChildProcess | null = null
  private readonly defaultPort = 10095
  private readonly defaultHost = 'localhost'

  constructor(config: ASRProviderConfig, callbacks: ASRCallbacks) {
    super(config, callbacks)
  }

  async initialize(): Promise<void> {
    // 检查 FunASR 模型是否存在
    const modelPath = this.config.funasr?.modelPath || this.getDefaultModelPath()
    if (!existsSync(modelPath)) {
      console.warn('[FunASR] 模型路径不存在:', modelPath)
      // 可以在这里触发模型下载
    }
    console.log('[FunASR] 初始化完成，模型路径:', modelPath)
  }

  async startStreaming(): Promise<void> {
    if (this.isConnected) {
      console.log('[FunASR] 已经连接，跳过')
      return
    }

    this.updateStatus('connecting')

    try {
      // 尝试连接到 FunASR 服务
      const url = `ws://${this.defaultHost}:${this.defaultPort}`

      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        console.log('[FunASR] WebSocket 连接成功')
        this.isConnected = true
        this.updateStatus('connected')
        this.sendStartMessage()
      })

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data)
      })

      this.ws.on('error', async (error) => {
        console.error('[FunASR] WebSocket 错误:', error.message)

        // 如果连接失败，尝试启动本地 FunASR 服务
        if (!this.funasrProcess) {
          console.log('[FunASR] 尝试启动本地服务...')
          const started = await this.startFunASService()
          if (started) {
            // 服务启动后重试连接
            setTimeout(() => this.reconnect(), 1000)
            return
          }
        }

        this.sendError({
          code: 'WEBSOCKET_ERROR',
          message: '无法连接到 FunASR 服务，请确保服务已启动',
          provider: 'funasr'
        })
      })

      this.ws.on('close', () => {
        console.log('[FunASR] WebSocket 关闭')
        this.isConnected = false
        if (this.status === 'recognizing') {
          this.updateStatus('idle')
        }
      })
    } catch (error) {
      this.updateStatus('error')
      this.sendError({
        code: 'CONNECTION_FAILED',
        message: error instanceof Error ? error.message : '连接失败',
        provider: 'funasr'
      })
    }
  }

  sendAudioChunk(chunk: AudioChunk): void {
    if (!this.ws || !this.isConnected) {
      console.warn('[FunASR] 未连接，无法发送音频')
      return
    }

    if (this.status !== 'recognizing') {
      this.updateStatus('recognizing')
    }

    // FunASR 使用二进制格式发送音频
    // 格式: 4字节长度 + 音频数据
    const lengthBuffer = Buffer.alloc(4)
    lengthBuffer.writeInt32BE(chunk.data.length, 0)
    this.ws.send(Buffer.concat([lengthBuffer, chunk.data]))
  }

  async stopStreaming(): Promise<void> {
    if (!this.ws || !this.isConnected) {
      return
    }

    // 发送结束信号
    const endSignal = Buffer.alloc(4)
    endSignal.writeInt32BE(0, 0)
    this.ws.send(endSignal)

    // 等待最终结果
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        this.ws?.close()
        this.ws = null
        this.isConnected = false
        this.updateStatus('idle')
        resolve()
      }, 500)
    })
  }

  async isAvailable(): Promise<boolean> {
    // 检查是否配置了 FunASR
    const modelPath = this.config.funasr?.modelPath || this.getDefaultModelPath()
    // 对于本地模式，只要模型路径配置了就认为可用
    // 实际连接时会检测服务是否启动
    return !!modelPath
  }

  destroy(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    if (this.funasrProcess) {
      this.funasrProcess.kill()
      this.funasrProcess = null
    }
    this.isConnected = false
    this.removeAllListeners()
  }

  /**
   * 获取默认模型路径
   */
  private getDefaultModelPath(): string {
    const userDataPath = app.getPath('userData')
    return join(userDataPath, 'models', 'funasr')
  }

  /**
   * 启动 FunASR 本地服务
   */
  private async startFunASService(): Promise<boolean> {
    const modelPath = this.config.funasr?.modelPath || this.getDefaultModelPath()

    // 检查 Python 环境
    // TODO: 实现真正的 FunASR 服务启动逻辑
    // 这里只是一个框架，实际需要：
    // 1. 检查 Python 是否安装
    // 2. 检查 funasr 包是否安装
    // 3. 启动 funasr 服务

    console.log('[FunASR] 启动服务，模型路径:', modelPath)
    console.warn('[FunASR] 本地服务启动尚未实现，请手动启动 funasr 服务')

    return false
  }

  /**
   * 重新连接
   */
  private async reconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    await this.startStreaming()
  }

  /**
   * 发送开始消息
   */
  private sendStartMessage(): void {
    if (!this.ws) return

    // FunASR 的启动配置
    const config = {
      mode: '2pass',  // 两遍模式，结合流式和离线
      chunk_size: [5, 10, 5],  // 流式块大小
      encoder_chunk_look_back: 4,
      decoder_chunk_look_back: 1,
      hotwords: ''  // 热词，可以从 termManager 获取
    }

    this.ws.send(JSON.stringify(config))
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: Buffer): void {
    try {
      const response = JSON.parse(data.toString())

      if (response.text) {
        const text = response.text
        const isFinal = response.mode === 'offline' || response.is_final

        this.sendResult({
          text,
          isFinal,
          confidence: response.confidence,
          timestamp: Date.now()
        })
      } else if (response.status === 'error') {
        this.sendError({
          code: response.error_code || 'RECOGNITION_ERROR',
          message: response.error_message || '识别错误',
          provider: 'funasr'
        })
      }
    } catch (error) {
      console.error('[FunASR] 解析消息失败:', error)
    }
  }
}
