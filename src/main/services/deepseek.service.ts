import OpenAI from 'openai'
import { API_CONFIG, AI_PROMPTS } from '@shared/constants/index.js'
import { AiProcessingMode, UserSettings } from '@shared/types/index.js'

export interface ProcessOptions {
  mode: AiProcessingMode
  toneStyle?: UserSettings['toneStyle']
  assistantAction?: string
  targetLanguage?: string
}

export class DeepSeekService {
  private client: OpenAI | null = null

  constructor(apiKey: string) {
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: API_CONFIG.DEEPSEEK.BASE_URL
      })
    }
  }

  /**
   * 更新 API Key
   */
  setApiKey(apiKey: string): void {
    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        baseURL: API_CONFIG.DEEPSEEK.BASE_URL
      })
    } else {
      this.client = null
    }
  }

  /**
   * 处理文本
   */
  async process(
    text: string,
    options: ProcessOptions
  ): Promise<{ success: boolean; result?: string; error?: string }> {
    if (!this.client) {
      return {
        success: false,
        error: 'DeepSeek API Key 未设置'
      }
    }

    try {
      const prompt = this.buildPrompt(text, options)

      const response = await this.client.chat.completions.create({
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
      })

      if (response.choices && response.choices.length > 0) {
        return {
          success: true,
          result: response.choices[0].message.content?.trim()
        }
      } else {
        return {
          success: false,
          error: 'API 返回空结果'
        }
      }
    } catch (error) {
      console.error('[DeepSeekService] 处理失败:', error)

      if (error instanceof OpenAI.APIError) {
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
        } else if (error.status === 402) {
          return {
            success: false,
            error: '账户余额不足'
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
   * 翻译文本
   */
  async translate(
    text: string,
    targetLanguage: string
  ): Promise<{ success: boolean; result?: string; error?: string }> {
    const prompt = AI_PROMPTS.TRANSLATE
      .replace('{{language}}', targetLanguage)
      .replace('{{text}}', text)

    return this.process(text, { mode: 'translate' })
  }

  /**
   * 总结文本
   */
  async summarize(text: string): Promise<{ success: boolean; result?: string; error?: string }> {
    const prompt = AI_PROMPTS.ASSISTANT_SUMMARIZE.replace('{{text}}', text)
    return this.process(text, { mode: 'assistant', assistantAction: 'summarize' })
  }

  /**
   * 解释文本
   */
  async explain(text: string): Promise<{ success: boolean; result?: string; error?: string }> {
    const prompt = AI_PROMPTS.ASSISTANT_EXPLAIN.replace('{{text}}', text)
    return this.process(text, { mode: 'assistant', assistantAction: 'explain' })
  }

  /**
   * 扩展文本
   */
  async expand(text: string): Promise<{ success: boolean; result?: string; error?: string }> {
    const prompt = AI_PROMPTS.ASSISTANT_EXPAND.replace('{{text}}', text)
    return this.process(text, { mode: 'assistant', assistantAction: 'expand' })
  }

  /**
   * 构建 prompt
   */
  private buildPrompt(text: string, options: ProcessOptions): string {
    let promptTemplate: string

    switch (options.mode) {
      case 'clean':
        promptTemplate = AI_PROMPTS.CLEAN
        break
      case 'format':
        promptTemplate = AI_PROMPTS.FORMAT
        break
      case 'translate':
        promptTemplate = AI_PROMPTS.TRANSLATE.replace('{{language}}', options.targetLanguage || '英文')
        break
      case 'assistant':
        switch (options.assistantAction) {
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
    if (options.toneStyle && options.mode === 'clean') {
      let tonePrompt = ''
      switch (options.toneStyle) {
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

      if (tonePrompt) {
        return `${promptTemplate.replace('{{text}}', text)}\n\n${tonePrompt.replace('{{text}}', '[上述文本]')}`
      }
    }

    return promptTemplate.replace('{{text}}', text)
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
      if (error instanceof OpenAI.APIError && error.status === 401) {
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

  /**
   * 估算 token 数量
   */
  estimateTokens(text: string): number {
    // 简单估算：英文单词数 + 中文字符数 * 2
    const englishWords = text.split(/\s+/).filter(w => /^[a-zA-Z]+$/.test(w)).length
    const chineseChars = text.split('').filter(c => /[\u4e00-\u9fa5]/.test(c)).length
    return Math.ceil(englishWords + chineseChars * 2)
  }
}
