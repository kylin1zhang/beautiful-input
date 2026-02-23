import WebSocket from 'ws'
import { BaseASRProvider } from './base.js'
import { ASRProviderConfig, ASRCallbacks, AudioChunk } from '../types.js'
import { StreamingASRResult, StreamingASRStatus, StreamingASRError } from '@shared/types'
import crypto from 'crypto'

/**
 * 智谱 GLM-4-Voice 流式语音识别提供商
 * 使用 WebSocket 实现实时语音识别
 */
export class ZhipuASRProvider extends BaseASRProvider {
  private ws: WebSocket | null = null
  private isConnected = false
  private apiKey: string = ''

  constructor(config: ASRProviderConfig, callbacks: ASRCallbacks) {
    super(config, callbacks)
    this.apiKey = config.zhipu?.apiKey || ''
  }

  async initialize(): Promise<void> {
    console.log('[ZhipuASR] 初始化完成')
  }

  async startStreaming(): Promise<void> {
    if (this.isConnected) {
      console.log('[ZhipuASR] 已经连接，跳过')
      return
    }

    if (!this.apiKey) {
      this.sendError({
        code: 'NO_API_KEY',
        message: '未配置智谱 API Key',
        provider: 'zhipu'
      })
      return
    }

    this.updateStatus('connecting')

    try {
      // 智谱 WebSocket URL
      const url = await this.buildWebSocketUrl()
      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        console.log('[ZhipuASR] WebSocket 连接成功')
        this.isConnected = true
        this.updateStatus('connected')
      })

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data)
      })

      this.ws.on('error', (error) => {
        console.error('[ZhipuASR] WebSocket 错误:', error)
        this.sendError({
          code: 'WEBSOCKET_ERROR',
          message: error.message,
          provider: 'zhipu'
        })
      })

      this.ws.on('close', () => {
        console.log('[ZhipuASR] WebSocket 关闭')
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
        provider: 'zhipu'
      })
    }
  }

  sendAudioChunk(chunk: AudioChunk): void {
    if (!this.ws || !this.isConnected) {
      console.warn('[ZhipuASR] 未连接，无法发送音频')
      return
    }

    if (this.status !== 'recognizing') {
      this.updateStatus('recognizing')
    }

    // 智谱使用 base64 编码的音频数据
    const message = JSON.stringify({
      type: 'audio',
      data: chunk.data.toString('base64')
    })
    this.ws.send(message)
  }

  async stopStreaming(): Promise<void> {
    if (!this.ws || !this.isConnected) {
      return
    }

    // 发送结束信号
    const message = JSON.stringify({
      type: 'stop'
    })
    this.ws.send(message)

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
    return !!this.apiKey
  }

  destroy(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    this.removeAllListeners()
  }

  /**
   * 构建 WebSocket URL
   */
  private async buildWebSocketUrl(): Promise<string> {
    // 智谱 GLM-4-Voice WebSocket 地址
    // 实际 URL 需要根据智谱 API 文档确定
    const baseUrl = 'wss://open.bigmodel.cn/api/paas/v4/audio/transcriptions'
    const timestamp = Date.now()
    const signature = this.generateSignature(timestamp)

    return `${baseUrl}?api_key=${this.apiKey}&timestamp=${timestamp}&signature=${signature}`
  }

  /**
   * 生成签名
   */
  private generateSignature(timestamp: number): string {
    // 简化的签名生成，实际需要按照智谱 API 文档实现
    const message = `${this.apiKey}${timestamp}`
    return crypto.createHash('sha256').update(message).digest('hex')
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: Buffer): void {
    try {
      const response = JSON.parse(data.toString())

      if (response.code === 0 || response.status === 'success') {
        const text = response.text || response.result || ''
        const isFinal = response.is_final || response.type === 'final'

        this.sendResult({
          text,
          isFinal,
          confidence: response.confidence,
          timestamp: Date.now()
        })
      } else if (response.code !== 0 || response.status === 'error') {
        this.sendError({
          code: response.code?.toString() || 'UNKNOWN',
          message: response.message || response.msg || '识别错误',
          provider: 'zhipu'
        })
      }
    } catch (error) {
      console.error('[ZhipuASR] 解析消息失败:', error)
    }
  }
}
