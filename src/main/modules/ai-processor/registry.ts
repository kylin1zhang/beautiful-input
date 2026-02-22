// src/main/modules/ai-processor/registry.ts

import { BaseAIProvider } from './providers/base.js'
import { OpenAICompatibleProvider } from './providers/openai-compatible.js'
import { ClaudeProvider } from './providers/claude.js'
import { GeminiProvider } from './providers/gemini.js'
import { AIProviderConfig, AIModelConfig } from '@shared/types/index.js'

/**
 * 内置 AI 服务提供商配置
 */
export const BUILTIN_PROVIDERS: AIProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    isBuiltIn: true,
    isEnabled: true,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', isDefault: true },
      { id: 'deepseek-coder', name: 'DeepSeek Coder' }
    ]
  },
  {
    id: 'qwen',
    name: '千问 (Qwen)',
    protocol: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    isBuiltIn: true,
    isEnabled: true,
    models: [
      { id: 'qwen-turbo', name: 'Qwen Turbo (快速)', isDefault: true },
      { id: 'qwen-plus', name: 'Qwen Plus (平衡)' },
      { id: 'qwen-max', name: 'Qwen Max (效果优先)' }
    ]
  },
  {
    id: 'groq',
    name: 'Groq',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    isBuiltIn: true,
    isEnabled: true,
    models: [
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', isDefault: true },
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' }
    ]
  },
  {
    id: 'claude',
    name: 'Claude (Anthropic)',
    protocol: 'claude',
    baseUrl: 'https://api.anthropic.com',
    isBuiltIn: true,
    isEnabled: true,
    models: [
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (快速)', isDefault: true },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
    ]
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    isBuiltIn: true,
    isEnabled: true,
    models: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (快速)', isDefault: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (实验版)' }
    ]
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    protocol: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    isBuiltIn: true,
    isEnabled: true,
    models: [
      { id: 'glm-4-flash', name: 'GLM-4 Flash (免费)', isDefault: true },
      { id: 'glm-4', name: 'GLM-4' },
      { id: 'glm-4-plus', name: 'GLM-4 Plus' }
    ]
  }
]

/**
 * AI Provider 注册表
 * 管理所有可用的 AI 服务提供商
 */
export class ProviderRegistry {
  private providers: Map<string, BaseAIProvider> = new Map()
  private configs: Map<string, AIProviderConfig> = new Map()

  constructor() {
    this.initializeBuiltinProviders()
  }

  /**
   * 初始化内置提供商
   */
  private initializeBuiltinProviders(): void {
    for (const config of BUILTIN_PROVIDERS) {
      this.configs.set(config.id, config)

      // 创建 Provider 实例
      const provider = this.createProvider(config)
      if (provider) {
        this.providers.set(config.id, provider)
      }
    }
  }

  /**
   * 根据配置创建 Provider 实例
   */
  private createProvider(config: AIProviderConfig): BaseAIProvider | null {
    switch (config.protocol) {
      case 'openai-compatible':
        return new OpenAICompatibleProvider(
          config.id,
          config.name,
          config.baseUrl || '',
          config.models,
          0.3,
          4096
        )
      case 'claude':
        return new ClaudeProvider()
      case 'gemini':
        return new GeminiProvider()
      case 'local':
        // LocalLLM Provider 将在后续 Task 中实现
        console.log('[ProviderRegistry] Local LLM Provider 尚未实现')
        return null
      default:
        console.warn(`[ProviderRegistry] 未知的协议类型: ${(config as AIProviderConfig).protocol}`)
        return null
    }
  }

  /**
   * 获取 Provider 实例
   */
  getProvider(id: string): BaseAIProvider | undefined {
    return this.providers.get(id)
  }

  /**
   * 获取 Provider 配置
   */
  getConfig(id: string): AIProviderConfig | undefined {
    return this.configs.get(id)
  }

  /**
   * 获取所有提供商配置
   */
  getAllConfigs(): AIProviderConfig[] {
    return Array.from(this.configs.values())
  }

  /**
   * 获取所有内置提供商配置
   */
  getBuiltinConfigs(): AIProviderConfig[] {
    return this.getAllConfigs().filter(c => c.isBuiltIn)
  }

  /**
   * 添加自定义提供商
   */
  addCustomProvider(config: AIProviderConfig): boolean {
    if (this.providers.has(config.id)) {
      console.warn(`[ProviderRegistry] 提供商已存在: ${config.id}`)
      return false
    }

    this.configs.set(config.id, { ...config, isBuiltIn: false })
    const provider = this.createProvider(config)
    if (provider) {
      this.providers.set(config.id, provider)
      return true
    }
    return false
  }

  /**
   * 移除提供商（仅限自定义）
   */
  removeProvider(id: string): boolean {
    const config = this.configs.get(id)
    if (config?.isBuiltIn) {
      console.warn(`[ProviderRegistry] 不能移除内置提供商: ${id}`)
      return false
    }

    this.providers.delete(id)
    this.configs.delete(id)
    return true
  }

  /**
   * 更新提供商配置
   */
  updateConfig(id: string, updates: Partial<AIProviderConfig>): boolean {
    const config = this.configs.get(id)
    if (!config) return false

    const newConfig = { ...config, ...updates }
    this.configs.set(id, newConfig)

    // 如果 baseUrl 变更，重新创建 Provider
    if (updates.baseUrl || updates.protocol) {
      const provider = this.createProvider(newConfig)
      if (provider) {
        this.providers.set(id, provider)
      }
    }

    return true
  }

  /**
   * 注册 Provider 实例（用于外部创建的 Provider，如 LocalLLM）
   */
  registerProvider(id: string, config: AIProviderConfig, provider: BaseAIProvider): void {
    this.configs.set(id, config)
    this.providers.set(id, provider)
  }

  /**
   * 取消所有 Provider 的当前请求
   */
  cancelAll(): void {
    for (const provider of this.providers.values()) {
      provider.cancel()
    }
  }
}

// 单例实例
export const providerRegistry = new ProviderRegistry()
