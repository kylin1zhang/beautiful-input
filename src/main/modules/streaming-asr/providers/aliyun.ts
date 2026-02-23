import WebSocket from 'ws'
import crypto from 'crypto'
import { BaseASRProvider } from './base.js'
import { ASRProviderConfig, ASRCallbacks, AudioChunk } from '../types.js'
import { StreamingASRResult, StreamingASRStatus, StreamingASRError } from '@shared/types'

/**
 * 阿里云 Paraformer 流式语音识别提供商
 * 使用 WebSocket 实现实时语音识别
 */
export class AliyunASRProvider extends BaseASRProvider {
  private ws: WebSocket | null = null
  private isConnected = false
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 3

  constructor(config: ASRProviderConfig, callbacks: ASRCallbacks) {
    super(config, callbacks)
  }

  async initialize(): Promise<void> {
    // 阿里云不需要特殊初始化
    console.log('[AliyunASR] 初始化完成')
  }

  async startStreaming(): Promise<void> {
    if (this.isConnected) {
      console.log('[AliyunASR] 已经连接，跳过')
      return
    }

    this.updateStatus('connecting')

    try {
      const url = await this.buildWebSocketUrl()
      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        console.log('[AliyunASR] WebSocket 连接成功')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.updateStatus('connected')
        this.sendStartMessage()
      })

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data)
      })

      this.ws.on('error', (error) => {
        console.error('[AliyunASR] WebSocket 错误:', error)
        this.sendError({
          code: 'WEBSOCKET_ERROR',
          message: error.message,
          provider: 'aliyun'
        })
      })

      this.ws.on('close', () => {
        console.log('[AliyunASR] WebSocket 关闭')
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
        provider: 'aliyun'
      })
    }
  }

  sendAudioChunk(chunk: AudioChunk): void {
    if (!this.ws || !this.isConnected) {
      console.warn('[AliyunASR] 未连接，无法发送音频')
      return
    }

    if (this.status !== 'recognizing') {
      this.updateStatus('recognizing')
    }

    // 发送音频数据（需要按照阿里云的格式）
    const message = JSON.stringify({
      header: {
        action: 'audio_data'
      },
      payload: {
        audio: chunk.data.toString('base64')
      }
    })
    this.ws.send(message)
  }

  async stopStreaming(): Promise<void> {
    if (!this.ws || !this.isConnected) {
      return
    }

    // 发送结束消息
    const message = JSON.stringify({
      header: {
        action: 'stop'
      }
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
    const config = this.config.aliyun
    return !!(config?.accessKeyId && config?.accessKeySecret && config?.appKey)
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
    const config = this.config.aliyun!
    const region = 'cn-shanghai'
    const host = `nls-gateway.${region}.aliyuncs.com`
    const path = '/ws/v1'

    // 简化版 URL（实际需要按照阿里云签名规范）
    const url = `wss://${host}${path}?appkey=${config.appKey}&token=${await this.getToken()}`

    return url
  }

  /**
   * 获取 Token（简化版，实际应该从阿里云获取）
   */
  private async getToken(): Promise<string> {
    // TODO: 实现从阿里云获取 Token 的逻辑
    // 这里返回占位符，实际使用时需要调用阿里云 API 获取
    return 'placeholder-token'
  }

  /**
   * 发送开始消息
   */
  private sendStartMessage(): void {
    if (!this.ws) return

    const message = JSON.stringify({
      header: {
        action: 'start'
      },
      payload: {
        format: 'pcm',
        sample_rate: 16000,
        enable_punctuation: true,
        enable_inverse_text_normalization: true
      }
    })
    this.ws.send(message)
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: Buffer): void {
    try {
      const response = JSON.parse(data.toString())

      if (response.header?.status === 'success') {
        const text = response.payload?.text || ''
        const isFinal = response.header?.action === 'result' && response.payload?.is_final

        this.sendResult({
          text,
          isFinal,
          confidence: response.payload?.confidence,
          timestamp: Date.now()
        })
      } else if (response.header?.status === 'error') {
        this.sendError({
          code: response.header?.error_code || 'UNKNOWN',
          message: response.header?.error_message || '未知错误',
          provider: 'aliyun'
        })
      }
    } catch (error) {
      console.error('[AliyunASR] 解析消息失败:', error)
    }
  }
}
