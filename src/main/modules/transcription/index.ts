import { EventEmitter } from 'events'
import FormData from 'form-data'
import axios from 'axios'
import { TranscriptionResult } from '@shared/types/index.js'
import { API_CONFIG } from '@shared/constants/index.js'
import { bufferToWav, retry } from '@shared/utils/index.js'

// ASR 提供商类型
type AsrProvider = 'groq' | 'openai' | 'local'

export class TranscriptionModule extends EventEmitter {
  private abortController: AbortController | null = null

  /**
   * 语音识别
   * @param audioBuffer 原始音频数据
   * @param apiKey API Key（根据 provider 自动选择使用哪个 key）
   * @param provider ASR 服务提供商 ('groq' | 'openai')
   * @param personalDictionary 个人词典（已废弃，参数保留用于兼容）
   */
  async transcribe(
    audioBuffer: Buffer,
    apiKey: string,
    provider: AsrProvider = 'groq',
    personalDictionary: string[] = []
  ): Promise<TranscriptionResult> {
    if (!apiKey) {
      const providerName = provider === 'groq' ? 'Groq' : 'OpenAI'
      return {
        success: false,
        error: `未配置 ${providerName} API Key`
      }
    }

    try {
      // 转换为 WAV 格式
      const wavBuffer = bufferToWav(audioBuffer, 16000, 1)

      // 检查文件大小
      const maxSize = provider === 'groq' ? API_CONFIG.GROQ.MAX_FILE_SIZE : 25 * 1024 * 1024
      if (wavBuffer.length > maxSize) {
        return {
          success: false,
          error: '音频文件过大，请缩短录音时长'
        }
      }

      // 注意：个人词典功能已移至 AI 处理阶段应用
      // Whisper 的 prompt 参数不可靠，容易被模型当作输出内容

      // 根据 provider 调用对应的 API（不传 prompt）
      const result = await retry(
        () => provider === 'groq'
          ? this.callGroqAPI(wavBuffer, apiKey, '')
          : this.callOpenAIAPI(wavBuffer, apiKey, ''),
        3,
        1000
      )

      return result
    } catch (error) {
      console.error('[Transcription] 识别失败:', error)
      return {
        success: false,
        error: (error as Error).message || '语音识别失败'
      }
    }
  }

  /**
   * 调用 Groq API
   */
  private async callGroqAPI(
    wavBuffer: Buffer,
    apiKey: string,
    prompt: string
  ): Promise<TranscriptionResult> {
    this.abortController = new AbortController()

    try {
      const formData = new FormData()
      formData.append('file', wavBuffer, {
        filename: 'recording.wav',
        contentType: 'audio/wav',
        knownLength: wavBuffer.length
      })
      formData.append('model', API_CONFIG.GROQ.WHISPER_MODEL)
      formData.append('language', 'zh')
      formData.append('prompt', prompt)
      formData.append('response_format', 'json')
      formData.append('temperature', '0')

      const response = await axios.post(
        `${API_CONFIG.GROQ.BASE_URL}/audio/transcriptions`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${apiKey}`
          },
          signal: this.abortController.signal,
          timeout: 120000 // 120秒 - 支持长音频上传和处理
        }
      )

      if (response.data && response.data.text) {
        return {
          success: true,
          text: response.data.text.trim(),
          confidence: response.data.confidence || 1.0
        }
      } else {
        return {
          success: false,
          error: 'API 返回数据格式错误'
        }
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const status = error.response.status
          const data = error.response.data

          if (status === 401) {
            return {
              success: false,
              error: 'API Key 无效，请检查设置'
            }
          } else if (status === 429) {
            return {
              success: false,
              error: '请求过于频繁，请稍后重试'
            }
          } else if (status === 413) {
            return {
              success: false,
              error: '音频文件过大'
            }
          } else {
            return {
              success: false,
              error: `API 错误: ${data?.error?.message || error.message}`
            }
          }
        } else if (error.request) {
          return {
            success: false,
            error: '网络错误，请检查网络连接'
          }
        }
      }

      throw error
    } finally {
      this.abortController = null
    }
  }

  /**
   * 调用 OpenAI Whisper API
   */
  private async callOpenAIAPI(
    wavBuffer: Buffer,
    apiKey: string,
    prompt: string
  ): Promise<TranscriptionResult> {
    this.abortController = new AbortController()

    try {
      const formData = new FormData()
      formData.append('file', wavBuffer, {
        filename: 'recording.wav',
        contentType: 'audio/wav',
        knownLength: wavBuffer.length
      })
      formData.append('model', 'whisper-1')
      formData.append('language', 'zh')
      if (prompt) {
        formData.append('prompt', prompt)
      }
      formData.append('response_format', 'json')

      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${apiKey}`
          },
          signal: this.abortController.signal,
          timeout: 120000 // 120秒 - 支持长音频上传和处理
        }
      )

      if (response.data && response.data.text) {
        return {
          success: true,
          text: response.data.text.trim(),
          confidence: 1.0 // OpenAI Whisper 不返回置信度
        }
      } else {
        return {
          success: false,
          error: 'API 返回数据格式错误'
        }
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          const status = error.response.status
          const data = error.response.data

          if (status === 401) {
            return {
              success: false,
              error: 'API Key 无效，请检查设置'
            }
          } else if (status === 429) {
            return {
              success: false,
              error: '请求过于频繁，请稍后重试'
            }
          } else if (status === 413) {
            return {
              success: false,
              error: '音频文件过大'
            }
          } else {
            return {
              success: false,
              error: `API 错误: ${data?.error?.message || error.message}`
            }
          }
        } else if (error.request) {
          return {
            success: false,
            error: '网络错误，请检查网络连接'
          }
        }
      }

      throw error
    } finally {
      this.abortController = null
    }
  }

  /**
   * 取消识别
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  /**
   * 销毁模块
   */
  destroy(): void {
    this.cancel()
    this.removeAllListeners()
  }
}
