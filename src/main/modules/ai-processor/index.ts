import { EventEmitter } from 'events'
import axios from 'axios'
import { 
  AiProcessingRequest, 
  AiProcessingResponse, 
  AiProcessingMode,
  UserSettings 
} from '@shared/types/index.js'
import { API_CONFIG, AI_PROMPTS } from '@shared/constants/index.js'
import { retry } from '@shared/utils/index.js'

export class AiProcessorModule extends EventEmitter {
  private abortController: AbortController | null = null

  /**
   * 处理文本
   * @param text 原始文本
   * @param mode 处理模式
   * @param apiKey API Key
   * @param toneStyle 语调风格
   * @param assistantAction AI 助手动作
   * @param provider AI 服务提供商
   */
  async process(
    text: string,
    mode: AiProcessingMode,
    apiKey: string,
    toneStyle: UserSettings['toneStyle'] = 'professional',
    assistantAction?: string,
    provider: 'deepseek' | 'qwen' = 'deepseek'
  ): Promise<AiProcessingResponse> {
    if (!apiKey) {
      return {
        success: false,
        error: `未配置 ${provider === 'qwen' ? '千问' : 'DeepSeek'} API Key`
      }
    }

    try {
      // 构建 prompt
      const prompt = this.buildPrompt(text, mode, toneStyle, assistantAction)

      // 根据提供商选择 API
      const result = await retry(
        () => provider === 'qwen'
          ? this.callQwenAPI(prompt, apiKey)
          : this.callDeepSeekAPI(prompt, apiKey),
        3,
        1000
      )

      return result
    } catch (error) {
      console.error('[AI Processor] 处理失败:', error)
      return {
        success: false,
        error: (error as Error).message || 'AI 处理失败'
      }
    }
  }

  /**
   * 翻译文本
   * @param text 原始文本
   * @param targetLanguage 目标语言
   * @param apiKey API Key
   * @param provider AI 服务提供商
   */
  async translate(
    text: string,
    targetLanguage: string,
    apiKey: string,
    provider: 'deepseek' | 'qwen' = 'deepseek'
  ): Promise<AiProcessingResponse> {
    if (!apiKey) {
      return {
        success: false,
        error: `未配置 ${provider === 'qwen' ? '千问' : 'DeepSeek'} API Key`
      }
    }

    try {
      const prompt = AI_PROMPTS.TRANSLATE
        .replace('{{language}}', targetLanguage)
        .replace('{{text}}', text)

      return await retry(
        () => provider === 'qwen'
          ? this.callQwenAPI(prompt, apiKey)
          : this.callDeepSeekAPI(prompt, apiKey),
        3,
        1000
      )
    } catch (error) {
      console.error('[AI Processor] 翻译失败:', error)
      return {
        success: false,
        error: (error as Error).message || '翻译失败'
      }
    }
  }

  /**
   * 调用 DeepSeek API
   */
  private async callDeepSeekAPI(prompt: string, apiKey: string): Promise<AiProcessingResponse> {
    this.abortController = new AbortController()

    try {
      const response = await axios.post(
        `${API_CONFIG.DEEPSEEK.BASE_URL}/chat/completions`,
        {
          model: API_CONFIG.DEEPSEEK.MODEL,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的文本处理助手，擅长整理口语化文本、格式化内容、翻译和总结。请直接输出处理后的文本，不要添加任何解释或说明。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: API_CONFIG.DEEPSEEK.MAX_TOKENS,
          temperature: API_CONFIG.DEEPSEEK.TEMPERATURE,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          signal: this.abortController.signal,
          timeout: 30000
        }
      )

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const result = response.data.choices[0].message.content.trim()
        return {
          success: true,
          result
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
          } else if (status === 402) {
            return {
              success: false,
              error: '账户余额不足，请充值'
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
   * 调用千问 API
   */
  private async callQwenAPI(prompt: string, apiKey: string): Promise<AiProcessingResponse> {
    this.abortController = new AbortController()

    try {
      const response = await axios.post(
        `${API_CONFIG.QWEN.BASE_URL}/chat/completions`,
        {
          model: API_CONFIG.QWEN.MODEL,
          messages: [
            {
              role: 'system',
              content: '你是一个专业的文本处理助手，擅长整理口语化文本、格式化内容、翻译和总结。请直接输出处理后的文本，不要添加任何解释或说明。'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: API_CONFIG.QWEN.MAX_TOKENS,
          temperature: API_CONFIG.QWEN.TEMPERATURE,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          signal: this.abortController.signal,
          timeout: 30000
        }
      )

      if (response.data && response.data.choices && response.data.choices.length > 0) {
        const result = response.data.choices[0].message.content.trim()
        return {
          success: true,
          result
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
          } else if (status === 402) {
            return {
              success: false,
              error: '账户余额不足，请充值'
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
  private buildPrompt(
    text: string,
    mode: AiProcessingMode,
    toneStyle: UserSettings['toneStyle'],
    assistantAction?: string
  ): string {
    let promptTemplate: string

    // 根据模式选择基础模板
    switch (mode) {
      case 'clean':
        promptTemplate = AI_PROMPTS.CLEAN
        break
      case 'format':
        promptTemplate = AI_PROMPTS.FORMAT
        break
      case 'translate':
        promptTemplate = AI_PROMPTS.TRANSLATE
        break
      case 'assistant':
        switch (assistantAction) {
          case 'summarize':
            promptTemplate = AI_PROMPTS.ASSISTANT_SUMMARIZE
            break
          case 'explain':
            promptTemplate = AI_PROMPTS.ASSISTANT_EXPLAIN
            break
          case 'expand':
            promptTemplate = AI_PROMPTS.ASSISTANT_EXPAND
            break
          default:
            promptTemplate = AI_PROMPTS.CLEAN
        }
        break
      default:
        promptTemplate = AI_PROMPTS.CLEAN
    }

    // 应用语调风格
    let tonePrompt = ''
    switch (toneStyle) {
      case 'formal':
        tonePrompt = AI_PROMPTS.TONE_FORMAL
        break
      case 'casual':
        tonePrompt = AI_PROMPTS.TONE_CASUAL
        break
      case 'professional':
        tonePrompt = AI_PROMPTS.TONE_PROFESSIONAL
        break
      case 'creative':
        tonePrompt = AI_PROMPTS.TONE_CREATIVE
        break
    }

    // 组合 prompt
    let finalPrompt = promptTemplate.replace('{{text}}', text)
    
    if (tonePrompt && mode === 'clean') {
      // 如果是清理模式，先清理再应用语调
      finalPrompt = `${finalPrompt}\n\n${tonePrompt.replace('{{text}}', '[上述文本]')}`
    }

    return finalPrompt
  }

  /**
   * 取消处理
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
