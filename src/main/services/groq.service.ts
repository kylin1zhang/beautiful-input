import Groq from 'groq-sdk'
import { API_CONFIG } from '@shared/constants/index.js'

export interface TranscriptionOptions {
  language?: string
  prompt?: string
  temperature?: number
}

// Groq API 限制：最大文件大小 25MB
const MAX_FILE_SIZE = 25 * 1024 * 1024

export class GroqService {
  private client: Groq | null = null

  constructor(apiKey: string) {
    if (apiKey) {
      this.client = new Groq({
        apiKey,
      })
    }
  }

  /**
   * 更新 API Key
   */
  setApiKey(apiKey: string): void {
    if (apiKey) {
      this.client = new Groq({
        apiKey,
      })
    } else {
      this.client = null
    }
  }

  /**
   * 语音识别
   */
  async transcribe(
    audioBuffer: Buffer,
    options: TranscriptionOptions = {}
  ): Promise<{ success: boolean; text?: string; error?: string }> {
    if (!this.client) {
      return {
        success: false,
        error: 'Groq API Key 未设置'
      }
    }

    // 检查文件大小
    if (audioBuffer.length > MAX_FILE_SIZE) {
      const sizeMB = (audioBuffer.length / 1024 / 1024).toFixed(1)
      return {
        success: false,
        error: `音频文件过大 (${sizeMB}MB)，最大支持 25MB。请缩短录音时长。`
      }
    }

    try {
      console.log(`[GroqService] 开始语音识别，音频大小: ${(audioBuffer.length / 1024).toFixed(1)} KB`)

      // 创建 Blob（将 Buffer 转换为 Uint8Array 以兼容 BlobPart 类型）
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' })

      // 创建文件对象
      const file = new File([blob], 'recording.wav', { type: 'audio/wav' })

      const response = await this.client.audio.transcriptions.create({
        file,
        model: API_CONFIG.GROQ.WHISPER_MODEL,
        language: options.language || 'zh',
        prompt: options.prompt,
        temperature: options.temperature || 0,
        response_format: 'json'
      })

      if (response.text) {
        return {
          success: true,
          text: response.text.trim()
        }
      } else {
        return {
          success: false,
          error: 'API 返回空结果'
        }
      }
    } catch (error) {
      console.error('[GroqService] 识别失败:', error)

      // 检查错误类型并提供友好的错误信息
      const errorMessage = (error as Error).message || ''

      if (error instanceof Groq.APIError) {
        if (error.status === 401) {
          return {
            success: false,
            error: 'API Key 无效'
          }
        } else if (error.status === 429) {
          return {
            success: false,
            error: '请求过于频繁，请稍后再试'
          }
        } else if (error.status === 413) {
          return {
            success: false,
            error: '音频文件过大，请缩短录音时长'
          }
        } else if (error.status === 504 || errorMessage.includes('timeout')) {
          return {
            success: false,
            error: '服务器响应超时，请稍后重试'
          }
        }
        return {
          success: false,
          error: `API 错误: ${error.message}`
        }
      }

      // 处理网络错误
      if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('ECONN')) {
        return {
          success: false,
          error: '网络连接失败，请检查网络后重试'
        }
      }

      // 处理超时错误
      if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        return {
          success: false,
          error: '请求超时，请缩短录音时长或稍后重试'
        }
      }

      return {
        success: false,
        error: errorMessage || '未知错误'
      }
    }
  }

  /**
   * 检查 API Key 是否有效
   */
  async validateApiKey(): Promise<{ valid: boolean; error?: string }> {
    if (!this.client) {
      return {
        valid: false,
        error: 'API Key 未设置'
      }
    }

    try {
      // 尝试调用一个简单的 API 来验证
      await this.client.models.list()
      return { valid: true }
    } catch (error) {
      if (error instanceof Groq.APIError && error.status === 401) {
        return {
          valid: false,
          error: 'API Key 无效'
        }
      }
      return {
        valid: false,
        error: '验证失败'
      }
    }
  }

  /**
   * 获取模型列表
   */
  async getModels(): Promise<{ success: boolean; models?: string[]; error?: string }> {
    if (!this.client) {
      return {
        success: false,
        error: 'API Key 未设置'
      }
    }

    try {
      const response = await this.client.models.list()
      return {
        success: true,
        models: response.data.map(model => model.id)
      }
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      }
    }
  }
}
