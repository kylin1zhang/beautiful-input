import Groq from 'groq-sdk'
import { API_CONFIG } from '@shared/constants/index.js'

export interface TranscriptionOptions {
  language?: string
  prompt?: string
  temperature?: number
}

export class GroqService {
  private client: Groq | null = null

  constructor(apiKey: string) {
    if (apiKey) {
      this.client = new Groq({
        apiKey
      })
    }
  }

  /**
   * 更新 API Key
   */
  setApiKey(apiKey: string): void {
    if (apiKey) {
      this.client = new Groq({
        apiKey
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

    try {
      // 创建 Blob
      const blob = new Blob([audioBuffer], { type: 'audio/wav' })

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
      
      if (error instanceof Groq.APIError) {
        if (error.status === 401) {
          return {
            success: false,
            error: 'API Key 无效'
          }
        } else if (error.status === 429) {
          return {
            success: false,
            error: '请求过于频繁'
          }
        } else if (error.status === 413) {
          return {
            success: false,
            error: '音频文件过大'
          }
        }
        return {
          success: false,
          error: `API 错误: ${error.message}`
        }
      }

      return {
        success: false,
        error: (error as Error).message || '未知错误'
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
