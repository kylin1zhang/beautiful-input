import { BaseASRProvider } from './base.js'
import { ASRProviderConfig, ASRCallbacks, AudioChunk } from '../types.js'
import { StreamingASRResult, StreamingASRStatus, StreamingASRError } from '@shared/types'

/**
 * Groq Whisper 流式语音识别提供商
 * 注意：Groq Whisper API 不支持真正的流式识别
 * 此实现使用伪流式：收集音频数据，在停止时发送识别请求
 */
export class GroqASRProvider extends BaseASRProvider {
  private apiKey: string = ''
  private audioChunks: Buffer[] = []
  private isCollecting = false

  constructor(config: ASRProviderConfig, callbacks: ASRCallbacks) {
    super(config, callbacks)
    this.apiKey = config.groq?.apiKey || ''
  }

  async initialize(): Promise<void> {
    if (!this.apiKey) {
      console.warn('[GroqASR] 未配置 API Key')
    }
    console.log('[GroqASR] 初始化完成')
  }

  async startStreaming(): Promise<void> {
    if (this.isCollecting) {
      console.log('[GroqASR] 已经在收集音频，跳过')
      return
    }

    if (!this.apiKey) {
      this.sendError({
        code: 'NO_API_KEY',
        message: '未配置 Groq API Key',
        provider: 'groq'
      })
      return
    }

    this.audioChunks = []
    this.isCollecting = true
    this.updateStatus('connected')
    console.log('[GroqASR] 开始收集音频数据')
  }

  sendAudioChunk(chunk: AudioChunk): void {
    if (!this.isCollecting) {
      console.warn('[GroqASR] 未开始收集，无法接收音频')
      return
    }

    if (this.status !== 'recognizing') {
      this.updateStatus('recognizing')
    }

    // 收集音频数据
    this.audioChunks.push(chunk.data)

    // 可选：定期发送中间状态（模拟流式效果）
    // 这里我们只在收集数据，实际识别在 stopStreaming 时进行
  }

  async stopStreaming(): Promise<void> {
    if (!this.isCollecting) {
      return
    }

    this.isCollecting = false
    this.updateStatus('recognizing')

    try {
      // 合并所有音频数据
      const audioBuffer = Buffer.concat(this.audioChunks)
      console.log('[GroqASR] 准备发送识别请求，音频大小:', audioBuffer.length, 'bytes')

      // 发送到 Groq API
      const text = await this.transcribe(audioBuffer)

      // 发送最终结果
      this.sendResult({
        text,
        isFinal: true,
        timestamp: Date.now()
      })

      this.updateStatus('idle')
    } catch (error) {
      this.updateStatus('error')
      this.sendError({
        code: 'TRANSCRIPTION_FAILED',
        message: error instanceof Error ? error.message : '识别失败',
        provider: 'groq'
      })
    }

    this.audioChunks = []
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey
  }

  destroy(): void {
    this.audioChunks = []
    this.isCollecting = false
    this.removeAllListeners()
  }

  /**
   * 调用 Groq Whisper API 进行识别
   */
  private async transcribe(audioBuffer: Buffer): Promise<string> {
    const formData = new FormData()

    // 创建音频 Blob（WAV 格式需要添加头部）
    const wavBuffer = this.createWavBuffer(audioBuffer)
    // 将 Buffer 转换为 Uint8Array 以兼容 Blob
    const audioBlob = new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' })

    formData.append('file', audioBlob, 'audio.wav')
    formData.append('model', 'whisper-large-v3-turbo')
    formData.append('language', 'zh')
    formData.append('response_format', 'json')

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: formData
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Groq API 错误: ${response.status} - ${errorText}`)
    }

    const result = await response.json() as { text?: string }
    return result.text || ''
  }

  /**
   * 创建 WAV 格式的 Buffer
   */
  private createWavBuffer(pcmBuffer: Buffer): Buffer {
    const sampleRate = 16000
    const numChannels = 1
    const bitsPerSample = 16
    const byteRate = sampleRate * numChannels * bitsPerSample / 8
    const blockAlign = numChannels * bitsPerSample / 8
    const dataSize = pcmBuffer.length
    const fileSize = 36 + dataSize

    // WAV 文件头 (44 bytes)
    const header = Buffer.alloc(44)

    // RIFF chunk
    header.write('RIFF', 0)
    header.writeUInt32LE(fileSize, 4)
    header.write('WAVE', 8)

    // fmt chunk
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16)  // fmt chunk size
    header.writeUInt16LE(1, 20)   // audio format (1 = PCM)
    header.writeUInt16LE(numChannels, 22)
    header.writeUInt32LE(sampleRate, 24)
    header.writeUInt32LE(byteRate, 28)
    header.writeUInt16LE(blockAlign, 32)
    header.writeUInt16LE(bitsPerSample, 34)

    // data chunk
    header.write('data', 36)
    header.writeUInt32LE(dataSize, 40)

    return Buffer.concat([header, pcmBuffer])
  }
}
