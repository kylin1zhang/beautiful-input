import { EventEmitter } from 'events'
import {
  AiProcessingResponse,
  AiProcessingMode,
  UserSettings,
  AIProcessRequest
} from '@shared/types/index.js'
import { AI_PROMPTS } from '@shared/constants/index.js'
import { retry } from '@shared/utils/index.js'
import { providerRegistry } from './registry.js'
import { DEFAULT_SYSTEM_PROMPT } from './providers/base.js'

export class AiProcessorModule extends EventEmitter {
  /**
   * 处理文本
   */
  async process(
    text: string,
    mode: AiProcessingMode,
    settings: UserSettings,
    targetLanguage?: string
  ): Promise<AiProcessingResponse> {
    const { aiProvider, aiModel, toneStyle = 'professional', personalDictionary = [] } = settings

    // 获取 Provider
    const provider = providerRegistry.getProvider(aiProvider)
    if (!provider) {
      return {
        success: false,
        error: `未知的 AI 服务提供商: ${aiProvider}`
      }
    }

    // 获取 API Key
    const apiKey = this.getApiKey(settings, aiProvider)
    const config = providerRegistry.getConfig(aiProvider)

    // 本地 LLM 不需要 API Key
    if (!apiKey && aiProvider !== 'local') {
      return {
        success: false,
        error: `未配置 ${config?.name || aiProvider} API Key`
      }
    }

    // 构建 prompt
    const prompt = this.buildPrompt(text, mode, toneStyle, personalDictionary, targetLanguage)

    // 获取模型
    const model = aiModel || this.getDefaultModel(aiProvider)
    console.log(`[AiProcessor] aiProvider: ${aiProvider}, aiModel: ${aiModel}, 最终model: ${model}`)

    // 构建请求
    const request: AIProcessRequest = {
      prompt,
      model,
      apiKey,
      baseUrl: config?.baseUrl,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.3
    }

    try {
      const result = await retry(
        () => provider.process(request),
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
   * 翻译文本（兼容旧接口）
   */
  async translate(
    text: string,
    _targetLanguage: string,
    apiKey: string,
    _provider: 'deepseek' | 'qwen' = 'deepseek'
  ): Promise<AiProcessingResponse> {
    // 兼容旧的调用方式
    console.warn('[AI Processor] translate() 已弃用，请使用 process() 方法')
    return {
      success: false,
      error: 'translate() 方法已弃用'
    }
  }

  /**
   * 获取指定提供商的 API Key
   */
  private getApiKey(settings: UserSettings, providerId: string): string | undefined {
    // 兼容旧的 API Key 字段
    const keyMap: Record<string, keyof UserSettings> = {
      'deepseek': 'deepseekApiKey',
      'qwen': 'qwenApiKey',
      'groq': 'groqApiKey',
      'openai': 'openaiApiKey'
    }

    // 优先从 aiProviders 配置中获取
    if (settings.aiProviders) {
      const providerConfig = settings.aiProviders.find(p => p.id === providerId)
      if (providerConfig?.apiKey) {
        return providerConfig.apiKey
      }
    }

    // 回退到旧字段
    const keyField = keyMap[providerId]
    if (keyField) {
      return settings[keyField] as string
    }

    return undefined
  }

  /**
   * 获取默认模型
   */
  private getDefaultModel(providerId: string): string {
    const config = providerRegistry.getConfig(providerId)
    const defaultModel = config?.models.find(m => m.isDefault)
    return defaultModel?.id || config?.models[0]?.id || ''
  }

  /**
   * 构建 prompt
   */
  private buildPrompt(
    text: string,
    mode: AiProcessingMode,
    toneStyle: UserSettings['toneStyle'],
    personalDictionary: string[],
    targetLanguage?: string
  ): string {
    let promptTemplate: string

    switch (mode) {
      case 'clean':
        promptTemplate = AI_PROMPTS.CLEAN
        break
      case 'translate':
        promptTemplate = AI_PROMPTS.TRANSLATE
          .replace('{{language}}', targetLanguage || '英语')
        break
      default:
        promptTemplate = AI_PROMPTS.CLEAN
    }

    let finalPrompt = promptTemplate.replace('{{text}}', text)

    // 在 clean 模式下应用语调风格和个人词典
    if (mode === 'clean') {
      const additionalRequirements: string[] = []

      const toneMap: Record<string, string> = {
        'formal': '使用规范的书面语，避免口语化表达，适合商务或学术场景',
        'casual': '使用轻松自然的表达，适合日常交流，保持友好亲切',
        'professional': '准确使用专业术语，逻辑严谨，适合工作场景',
        'creative': '使用生动形象的表达，适当使用修辞手法，富有感染力'
      }

      const toneRequirement = toneMap[toneStyle || 'professional']
      if (toneRequirement) {
        additionalRequirements.push(toneRequirement)
      }

      if (personalDictionary.length > 0) {
        additionalRequirements.push(
          `以下专有名词必须保留原样，不得修改：${personalDictionary.join('、')}`
        )
      }

      if (additionalRequirements.length > 0) {
        finalPrompt = `${finalPrompt}\n\n【处理要求】\n${additionalRequirements.map((req, i) => `${i + 1}. ${req}`).join('\n')}\n\n只输出清理后的文本，不要输出任何其他内容。`
      }
    }

    return finalPrompt
  }

  /**
   * 取消处理
   */
  cancel(): void {
    providerRegistry.cancelAll()
  }

  /**
   * 销毁模块
   */
  destroy(): void {
    this.cancel()
    this.removeAllListeners()
  }
}
