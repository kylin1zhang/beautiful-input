import WebSocket from 'ws'
import crypto from 'crypto'
import { BaseASRProvider } from './base.js'
import { ASRProviderConfig, ASRCallbacks, AudioChunk } from '../types.js'
import { StreamingASRResult, StreamingASRStatus, StreamingASRError } from '@shared/types'

/**
 * 讯飞语音听写流式语音识别提供商
 * 使用 WebSocket 实现实时语音识别
 */
export class XunfeiASRProvider extends BaseASRProvider {
  private ws: WebSocket | null = null
  private isConnected = false
  private appId: string = ''
  private apiKey: string = ''
  private apiSecret: string = ''

  constructor(config: ASRProviderConfig, callbacks: ASRCallbacks) {
    super(config, callbacks)
    this.appId = config.xunfei?.appId || ''
    this.apiKey = config.xunfei?.apiKey || ''
    this.apiSecret = config.xunfei?.apiSecret || ''
  }

  async initialize(): Promise<void> {
    console.log('[XunfeiASR] 初始化完成')
  }

  async startStreaming(): Promise<void> {
    if (this.isConnected) {
      console.log('[XunfeiASR] 已经连接，跳过')
      return
    }

    if (!this.appId || !this.apiKey || !this.apiSecret) {
      this.sendError({
        code: 'NO_CREDENTIALS',
        message: '未配置讯飞 AppID/ApiKey/ApiSecret',
        provider: 'xunfei'
      })
      return
    }

    this.updateStatus('connecting')

    try {
      const url = this.buildWebSocketUrl()
      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        console.log('[XunfeiASR] WebSocket 连接成功')
        this.isConnected = true
        this.updateStatus('connected')
        // 发送首帧数据
        this.sendFirstFrame()
      })

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data)
      })

      this.ws.on('error', (error) => {
        console.error('[XunfeiASR] WebSocket 错误:', error)
        this.sendError({
          code: 'WEBSOCKET_ERROR',
          message: error.message,
          provider: 'xunfei'
        })
      })

      this.ws.on('close', () => {
        console.log('[XunfeiASR] WebSocket 关闭')
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
        provider: 'xunfei'
      })
    }
  }

  sendAudioChunk(chunk: AudioChunk): void {
    if (!this.ws || !this.isConnected) {
      console.warn('[XunfeiASR] 未连接，无法发送音频')
      return
    }

    if (this.status !== 'recognizing') {
      this.updateStatus('recognizing')
    }

    // 讯飞使用 JSON 格式发送音频数据
    const message = JSON.stringify({
      data: {
        status: 1,  // 1: 中间帧
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: chunk.data.toString('base64')
      }
    })
    this.ws.send(message)
  }

  async stopStreaming(): Promise<void> {
    if (!this.ws || !this.isConnected) {
      return
    }

    // 发送尾帧
    const message = JSON.stringify({
      data: {
        status: 2,  // 2: 尾帧
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: ''
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
    return !!(this.appId && this.apiKey && this.apiSecret)
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
   * 讯飞需要鉴权签名
   */
  private buildWebSocketUrl(): string {
    const host = 'iat-api.xfyun.cn'
    const path = '/v2/iat'
    const date = new Date().toUTCString()

    // 生成签名
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`
    const signatureSha = crypto
      .createHmac('sha256', this.apiSecret)
      .update(signatureOrigin)
      .digest('base64')

    const authorizationOrigin = `api_key="${this.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureSha}"`
    const authorization = Buffer.from(authorizationOrigin).toString('base64')

    const url = `wss://${host}${path}?authorization=${authorization}&date=${encodeURIComponent(date)}&host=${host}`

    return url
  }

  /**
   * 发送首帧
   */
  private sendFirstFrame(): void {
    if (!this.ws) return

    const message = JSON.stringify({
      common: {
        app_id: this.appId
      },
      business: {
        language: 'zh_cn',
        domain: 'iat',
        accent: 'mandarin',
        vad_eos: 3000,  // 静音检测时长
        dwa: 'wpgs'  // 动态修正
      },
      data: {
        status: 0,  // 0: 首帧
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: ''
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

      if (response.code === 0) {
        // 解析识别结果
        const ws = response.data?.result?.ws || []
        let text = ''
        for (const item of ws) {
          for (const cw of item.cw || []) {
            text += cw.w || ''
          }
        }

        const isFinal = response.data?.status === 2

        this.sendResult({
          text,
          isFinal,
          confidence: response.data?.result?.rg?.[0]?.confidence,
          timestamp: Date.now()
        })
      } else {
        this.sendError({
          code: response.code?.toString() || 'UNKNOWN',
          message: response.message || '识别错误',
          provider: 'xunfei'
        })
      }
    } catch (error) {
      console.error('[XunfeiASR] 解析消息失败:', error)
    }
  }
}
