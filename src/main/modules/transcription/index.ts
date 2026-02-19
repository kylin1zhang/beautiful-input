import { EventEmitter } from 'events'
import FormData from 'form-data'
import axios from 'axios'
import { TranscriptionResult } from '@shared/types/index.js'
import { API_CONFIG } from '@shared/constants/index.js'
import { bufferToWav, retry } from '@shared/utils/index.js'

export class TranscriptionModule extends EventEmitter {
  private abortController: AbortController | null = null

  /**
   * 语音识别
   * @param audioBuffer 原始音频数据
   * @param apiKey Groq API Key
   * @param personalDictionary 个人词典
   */
  async transcribe(
    audioBuffer: Buffer,
    apiKey: string,
    personalDictionary: string[] = []
  ): Promise<TranscriptionResult> {
    if (!apiKey) {
      return {
        success: false,
        error: '未配置 Groq API Key'
      }
    }

    try {
      // 转换为 WAV 格式
      const wavBuffer = bufferToWav(audioBuffer, 16000, 1)

      // 检查文件大小
      if (wavBuffer.length > API_CONFIG.GROQ.MAX_FILE_SIZE) {
        return {
          success: false,
          error: '音频文件过大，请缩短录音时长'
        }
      }

      // 构建 prompt
      const prompt = this.buildPrompt(personalDictionary)

      // 调用 Groq API
      const result = await retry(
        () => this.callGroqAPI(wavBuffer, apiKey, prompt),
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
          timeout: 30000
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
   * 构建 prompt
   */
  private buildPrompt(personalDictionary: string[]): string {
    const basePrompt = '请准确识别以下语音内容，保持中英文混合的准确性。'

    if (personalDictionary.length === 0) {
      return basePrompt
    }

    // 将个人词典注入 prompt
    const dictionaryPrompt = `请注意识别以下专有名词：${personalDictionary.join('、')}。`
    return `${basePrompt} ${dictionaryPrompt}`
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
