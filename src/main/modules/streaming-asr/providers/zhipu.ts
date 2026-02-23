import { BaseASRProvider } from './base.js'
import { ASRProviderConfig, ASRCallbacks, AudioChunk } from '../types.js'
import { StreamingASRResult, StreamingASRStatus, StreamingASRError } from '@shared/types'
import FormData from 'form-data'
import fetch from 'node-fetch'

/**
 * 智谱 GLM-ASR 流式语音识别提供商
 * 使用 HTTP POST + stream=true 实现流式语音识别
 */
export class ZhipuASRProvider extends BaseASRProvider {
  private apiKey: string = ''
  private audioChunks: Buffer[] = []
  private isProcessing = false
  private abortController: AbortController | null = null

  // 音频参数（与录音模块保持一致）
  private readonly SAMPLE_RATE = 16000
  private readonly CHANNELS = 1
  private readonly BITS_PER_SAMPLE = 16

  constructor(config: ASRProviderConfig, callbacks: ASRCallbacks) {
    super(config, callbacks)
    this.apiKey = config.zhipu?.apiKey || ''
  }

  async initialize(): Promise<void> {
    console.log('[ZhipuASR] 初始化完成, API Key:', this.apiKey ? `${this.apiKey.substring(0, 8)}...` : '未配置')
  }

  async startStreaming(): Promise<void> {
    if (!this.apiKey) {
      this.sendError({
        code: 'NO_API_KEY',
        message: '未配置智谱 API Key',
        provider: 'zhipu'
      })
      return
    }

    // 重置音频缓冲区
    this.audioChunks = []
    this.isProcessing = false
    this.updateStatus('connected')
    console.log('[ZhipuASR] 开始收集音频数据')
  }

  sendAudioChunk(chunk: AudioChunk): void {
    // 累积音频数据（智谱 API 是文件上传模式，不适合频繁调用）
    this.audioChunks.push(chunk.data)

    if (this.status !== 'recognizing') {
      this.updateStatus('recognizing')
    }

    // 不再在录音过程中发送识别请求，只在停止时统一处理
    // 因为智谱 API 是文件上传模式，频繁调用会增加成本和延迟
  }

  async stopStreaming(): Promise<void> {
    console.log('[ZhipuASR] 停止识别，等待处理完成...')

    // 等待正在进行的处理完成
    while (this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 处理剩余的音频数据（最终识别）
    if (this.audioChunks.length > 0) {
      await this.processAudioChunks(true)
    }

    this.updateStatus('idle')
    console.log('[ZhipuASR] 停止识别完成')
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.audioChunks = []
    this.isProcessing = false
    this.removeAllListeners()
  }

  /**
   * 创建 WAV 文件头
   */
  private createWavHeader(dataLength: number): Buffer {
    const header = Buffer.alloc(44)
    const byteRate = this.SAMPLE_RATE * this.CHANNELS * this.BITS_PER_SAMPLE / 8
    const blockAlign = this.CHANNELS * this.BITS_PER_SAMPLE / 8

    // RIFF chunk descriptor
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + dataLength, 4)
    header.write('WAVE', 8)

    // fmt sub-chunk
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16) // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20) // AudioFormat (1 for PCM)
    header.writeUInt16LE(this.CHANNELS, 22)
    header.writeUInt32LE(this.SAMPLE_RATE, 24)
    header.writeUInt32LE(byteRate, 28)
    header.writeUInt16LE(blockAlign, 32)
    header.writeUInt16LE(this.BITS_PER_SAMPLE, 34)

    // data sub-chunk
    header.write('data', 36)
    header.writeUInt32LE(dataLength, 40)

    return header
  }

  /**
   * 将 PCM 数据转换为 WAV 格式
   */
  private pcmToWav(pcmData: Buffer): Buffer {
    const wavHeader = this.createWavHeader(pcmData.length)
    return Buffer.concat([wavHeader, pcmData])
  }

  /**
   * 解析 SSE 格式的响应
   * 智谱 ASR 返回格式：
   * data: {"delta":"文本","type":"transcript.text.delta"}
   * data: {"text":"完整文本","type":"transcript.text.done"}
   * data: [DONE]
   */
  private parseSSEResponse(responseText: string): string {
    const lines = responseText.split('\n')
    let fullText = ''

    for (const line of lines) {
      const trimmedLine = line.trim()

      // 跳过空行和 [DONE]
      if (!trimmedLine || trimmedLine === 'data: [DONE]') {
        continue
      }

      // 解析 data: 开头的行
      if (trimmedLine.startsWith('data: ')) {
        try {
          const jsonStr = trimmedLine.substring(6) // 去掉 'data: ' 前缀
          const data = JSON.parse(jsonStr)

          // 优先使用最终结果的完整文本
          if (data.type === 'transcript.text.done' && data.text) {
            return data.text
          }

          // 累积增量文本
          if (data.type === 'transcript.text.delta' && data.delta) {
            fullText += data.delta
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }

    return fullText
  }

  /**
   * 处理累积的音频数据
   */
  private async processAudioChunks(isFinal: boolean): Promise<void> {
    if (this.isProcessing || this.audioChunks.length === 0) {
      return
    }

    this.isProcessing = true

    try {
      // 合并音频数据
      const pcmData = Buffer.concat(this.audioChunks)

      // 如果不是最终结果，清空缓冲区以便收集新的音频
      if (!isFinal) {
        this.audioChunks = []
      }

      console.log(`[ZhipuASR] 发送音频数据: ${pcmData.length} 字节, isFinal: ${isFinal}`)

      // 转换为 WAV 格式
      const wavData = this.pcmToWav(pcmData)

      // 创建 FormData
      const formData = new FormData()
      formData.append('model', 'glm-asr-2512')
      formData.append('stream', 'true')
      formData.append('file', wavData, {
        filename: 'audio.wav',
        contentType: 'audio/wav'
      })

      this.abortController = new AbortController()

      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...formData.getHeaders()
        },
        body: formData,
        signal: this.abortController.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      // 处理 SSE 流式响应
      const responseText = await response.text()
      console.log('[ZhipuASR] 原始响应:', responseText.substring(0, 500))

      // 解析 SSE 格式的响应
      const text = this.parseSSEResponse(responseText)
      console.log('[ZhipuASR] 解析后的识别结果:', text)

      if (text) {
        this.sendResult({
          text,
          isFinal,
          confidence: 1.0,
          timestamp: Date.now()
        })
      }

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log('[ZhipuASR] 请求已取消')
      } else {
        console.error('[ZhipuASR] 识别错误:', error)
        this.sendError({
          code: 'RECOGNITION_ERROR',
          message: error instanceof Error ? error.message : '识别失败',
          provider: 'zhipu'
        })
      }
    } finally {
      this.isProcessing = false
      this.abortController = null
    }
  }
}
