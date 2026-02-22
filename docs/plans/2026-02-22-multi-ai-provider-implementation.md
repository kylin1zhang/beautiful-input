# 多 AI 服务提供商支持实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 扩展 AI 处理模块，支持多种 AI 服务提供商（OpenAI 兼容/Claude/Gemini/本地 LLM），允许用户选择具体模型和添加自定义服务。

**Architecture:** 采用统一 Provider 抽象层架构，每种 API 协议实现独立的 Provider 类，通过 ProviderRegistry 统一管理。本地 LLM 使用 llama.cpp 作为推理引擎，通过 OpenAI 兼容接口提供服务。

**Tech Stack:** TypeScript, Axios, Electron IPC, React, llama.cpp

---

## Task 1: 扩展类型定义

**Files:**
- Modify: `src/shared/types/index.ts`

**Step 1: 添加 AI Provider 相关类型定义**

在 `src/shared/types/index.ts` 文件末尾添加以下类型定义：

```typescript
// ===== AI Provider 相关类型 =====

/** AI 服务协议类型 */
export type AIProtocol = 'openai-compatible' | 'claude' | 'gemini' | 'local'

/** AI 模型配置 */
export interface AIModelConfig {
  id: string
  name: string
  maxTokens?: number
  isDefault?: boolean
  isEnabled?: boolean
}

/** AI 服务提供商配置 */
export interface AIProviderConfig {
  id: string
  name: string
  protocol: AIProtocol
  baseUrl?: string
  apiKey?: string
  models: AIModelConfig[]
  defaultModel?: string
  isEnabled: boolean
  isBuiltIn?: boolean
}

/** 本地 LLM 模型信息 */
export interface LocalLLMModel {
  id: string
  name: string
  url: string
  size: string
  sizeBytes: number
  ramRequired: string
  recommended?: boolean
  downloaded?: boolean
}

/** 本地 LLM 配置 */
export interface LocalLLMConfig {
  enabled: boolean
  modelPath?: string
  builtinModelId?: string
  port: number
  autoStart: boolean
}

/** AI 处理请求（内部使用） */
export interface AIProcessRequest {
  prompt: string
  model: string
  apiKey?: string
  baseUrl?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}
```

**Step 2: 修改 UserSettings 接口**

修改 `UserSettings` 接口，将 `aiProvider` 字段类型从 `'deepseek' | 'qwen'` 改为 `string`，并添加新字段：

```typescript
// 在 UserSettings 接口中修改：
export interface UserSettings {
  // ... 现有字段保持不变 ...

  // 修改 AI 服务提供商类型
  aiProvider: string  // 当前选中的提供商 ID（原为 'deepseek' | 'qwen'）

  // 新增字段
  aiModel?: string                    // 当前选中的模型 ID
  aiProviders?: AIProviderConfig[]    // 所有提供商配置
  localLLM?: LocalLLMConfig           // 本地 LLM 配置

  // ... 其余字段 ...
}
```

**Step 3: 更新 defaultSettings**

在 `defaultSettings` 中添加新字段的默认值：

```typescript
export const defaultSettings: UserSettings = {
  // ... 现有字段 ...

  // AI 配置默认值
  aiProvider: 'deepseek',
  aiModel: 'deepseek-chat',
  aiProviders: [],  // 将在 registry 中初始化
  localLLM: {
    enabled: false,
    port: 8765,
    autoStart: false
  },

  // ... 其余字段 ...
}
```

**Step 4: 添加新的 IPC 通道**

在 `IpcChannels` 枚举中添加：

```typescript
export enum IpcChannels {
  // ... 现有通道 ...

  // AI Provider 相关
  GET_AI_PROVIDERS = 'get-ai-providers',
  SET_AI_PROVIDER = 'set-ai-provider',
  VALIDATE_AI_API_KEY = 'validate-ai-api-key',
  ADD_CUSTOM_AI_PROVIDER = 'add-custom-ai-provider',
  REMOVE_AI_PROVIDER = 'remove-ai-provider',

  // 本地 LLM 相关
  GET_LOCAL_LLM_MODELS = 'get-local-llm-models',
  DOWNLOAD_LOCAL_LLM_MODEL = 'download-local-llm-model',
  DELETE_LOCAL_LLM_MODEL = 'delete-local-llm-model',
  GET_LOCAL_LLM_STATUS = 'get-local-llm-status',
  LOCAL_LLM_DOWNLOAD_PROGRESS = 'local-llm-download-progress'
}
```

**Step 5: 运行类型检查验证**

```bash
cd "E:\下载\Kimi_Agent_语音输入工具设计\typeless"
npm run typecheck
```

Expected: 可能有类型错误（因为其他文件还未更新），但新增的类型定义本身应无语法错误。

**Step 6: 提交**

```bash
git add src/shared/types/index.ts
git commit -m "feat(types): 添加多 AI 服务提供商类型定义"
```

---

## Task 2: 创建 Provider 抽象基类

**Files:**
- Create: `src/main/modules/ai-processor/providers/base.ts`

**Step 1: 创建 providers 目录结构**

```bash
mkdir -p "E:\下载\Kimi_Agent_语音输入工具设计\typeless\src\main\modules\ai-processor\providers"
```

**Step 2: 创建 base.ts 文件**

```typescript
// src/main/modules/ai-processor/providers/base.ts

import { AIProcessRequest, AiProcessingResponse, AIModelConfig } from '@shared/types/index.js'

/**
 * AI 服务提供商抽象基类
 * 所有具体的 Provider 实现都需要继承此类
 */
export abstract class BaseAIProvider {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly protocol: 'openai-compatible' | 'claude' | 'gemini' | 'local'

  protected abortController: AbortController | null = null

  /**
   * 执行文本处理
   */
  abstract process(request: AIProcessRequest): Promise<AiProcessingResponse>

  /**
   * 获取可用模型列表
   */
  abstract getAvailableModels(): AIModelConfig[]

  /**
   * 验证 API Key 是否有效
   */
  abstract validateApiKey(apiKey: string): Promise<boolean>

  /**
   * 取消当前请求
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  /**
   * 创建新的 AbortController
   */
  protected createAbortController(): AbortController {
    this.abortController = new AbortController()
    return this.abortController
  }

  /**
   * 处理通用错误
   */
  protected handleError(error: unknown): AiProcessingResponse {
    if (this.isAbortError(error)) {
      return {
        success: false,
        error: '请求已取消'
      }
    }

    const message = error instanceof Error ? error.message : '未知错误'
    console.error(`[${this.name}Provider] 处理失败:`, error)

    return {
      success: false,
      error: message
    }
  }

  /**
   * 检查是否为取消错误
   */
  protected isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError'
  }
}

/**
 * 默认系统提示词
 */
export const DEFAULT_SYSTEM_PROMPT = `你是一个专业的文本处理助手，擅长整理口语化文本、格式化内容、翻译和总结。请直接输出处理后的文本，不要添加任何解释或说明。`
```

**Step 3: 提交**

```bash
git add src/main/modules/ai-processor/providers/base.ts
git commit -m "feat(ai-processor): 添加 Provider 抽象基类"
```

---

## Task 3: 实现 OpenAI 兼容 Provider

**Files:**
- Create: `src/main/modules/ai-processor/providers/openai-compatible.ts`

**Step 1: 创建 openai-compatible.ts 文件**

```typescript
// src/main/modules/ai-processor/providers/openai-compatible.ts

import axios, { AxiosError } from 'axios'
import { BaseAIProvider, DEFAULT_SYSTEM_PROMPT } from './base.js'
import { AIProcessRequest, AiProcessingResponse, AIModelConfig } from '@shared/types/index.js'

/**
 * OpenAI 兼容格式 Provider
 * 适用于：OpenAI、DeepSeek、Qwen、GLM、Groq 以及用户自定义的 OpenAI 兼容服务
 */
export class OpenAICompatibleProvider extends BaseAIProvider {
  readonly protocol = 'openai-compatible' as const

  constructor(
    public readonly id: string,
    public readonly name: string,
    private readonly defaultBaseUrl: string,
    private readonly models: AIModelConfig[],
    private readonly defaultTemperature: number = 0.3,
    private readonly defaultMaxTokens: number = 4096
  ) {
    super()
  }

  async process(request: AIProcessRequest): Promise<AiProcessingResponse> {
    const abortController = this.createAbortController()
    const baseUrl = request.baseUrl || this.defaultBaseUrl

    try {
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
        {
          model: request.model,
          messages: [
            {
              role: 'system',
              content: request.systemPrompt || DEFAULT_SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: request.prompt
            }
          ],
          max_tokens: request.maxTokens || this.defaultMaxTokens,
          temperature: request.temperature || this.defaultTemperature,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${request.apiKey}`,
            'Content-Type': 'application/json'
          },
          signal: abortController.signal,
          timeout: 60000
        }
      )

      if (response.data?.choices?.[0]?.message?.content) {
        return {
          success: true,
          result: response.data.choices[0].message.content.trim()
        }
      }

      return {
        success: false,
        error: 'API 返回数据格式错误'
      }
    } catch (error) {
      return this.handleApiError(error)
    } finally {
      this.abortController = null
    }
  }

  getAvailableModels(): AIModelConfig[] {
    return this.models
  }

  async validateApiKey(apiKey: string, baseUrl?: string): Promise<boolean> {
    try {
      const url = baseUrl || this.defaultBaseUrl
      const response = await axios.get(`${url}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 10000
      })
      return response.status === 200
    } catch {
      return false
    }
  }

  private handleApiError(error: unknown): AiProcessingResponse {
    if (this.isAbortError(error)) {
      return { success: false, error: '请求已取消' }
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: { message?: string } }>

      if (axiosError.response) {
        const status = axiosError.response.status
        const message = axiosError.response.data?.error?.message

        switch (status) {
          case 401:
            return { success: false, error: 'API Key 无效，请检查设置' }
          case 429:
            return { success: false, error: '请求过于频繁，请稍后重试' }
          case 402:
            return { success: false, error: '账户余额不足，请充值' }
          default:
            return { success: false, error: `API 错误: ${message || axiosError.message}` }
        }
      }

      if (axiosError.request) {
        return { success: false, error: '网络错误，请检查网络连接' }
      }
    }

    return this.handleError(error)
  }
}
```

**Step 2: 提交**

```bash
git add src/main/modules/ai-processor/providers/openai-compatible.ts
git commit -m "feat(ai-processor): 添加 OpenAI 兼容 Provider"
```

---

## Task 4: 实现 Claude Provider

**Files:**
- Create: `src/main/modules/ai-processor/providers/claude.ts`

**Step 1: 创建 claude.ts 文件**

```typescript
// src/main/modules/ai-processor/providers/claude.ts

import axios, { AxiosError } from 'axios'
import { BaseAIProvider, DEFAULT_SYSTEM_PROMPT } from './base.js'
import { AIProcessRequest, AiProcessingResponse, AIModelConfig } from '@shared/types/index.js'

/**
 * Anthropic Claude Provider
 */
export class ClaudeProvider extends BaseAIProvider {
  readonly protocol = 'claude' as const
  readonly id = 'claude'
  readonly name = 'Claude (Anthropic)'

  private readonly baseUrl = 'https://api.anthropic.com/v1'

  private readonly models: AIModelConfig[] = [
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (快速)', isDefault: true },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
  ]

  async process(request: AIProcessRequest): Promise<AiProcessingResponse> {
    const abortController = this.createAbortController()

    try {
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          model: request.model,
          max_tokens: request.maxTokens || 4096,
          system: request.systemPrompt || DEFAULT_SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: request.prompt }
          ]
        },
        {
          headers: {
            'x-api-key': request.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          signal: abortController.signal,
          timeout: 60000
        }
      )

      // Claude API 返回格式: content[0].text
      if (response.data?.content?.[0]?.text) {
        return {
          success: true,
          result: response.data.content[0].text.trim()
        }
      }

      return {
        success: false,
        error: 'API 返回数据格式错误'
      }
    } catch (error) {
      return this.handleApiError(error)
    } finally {
      this.abortController = null
    }
  }

  getAvailableModels(): AIModelConfig[] {
    return this.models
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      // Claude 没有单独的 models 端点，发送一个最小请求验证
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      )
      return response.status === 200
    } catch {
      return false
    }
  }

  private handleApiError(error: unknown): AiProcessingResponse {
    if (this.isAbortError(error)) {
      return { success: false, error: '请求已取消' }
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: { message?: string } }>

      if (axiosError.response) {
        const status = axiosError.response.status
        const message = axiosError.response.data?.error?.message

        switch (status) {
          case 401:
            return { success: false, error: 'API Key 无效' }
          case 429:
            return { success: false, error: '请求过于频繁，请稍后重试' }
          default:
            return { success: false, error: `API 错误: ${message || axiosError.message}` }
        }
      }

      if (axiosError.request) {
        return { success: false, error: '网络错误，请检查网络连接' }
      }
    }

    return this.handleError(error)
  }
}
```

**Step 2: 提交**

```bash
git add src/main/modules/ai-processor/providers/claude.ts
git commit -m "feat(ai-processor): 添加 Claude Provider"
```

---

## Task 5: 实现 Gemini Provider

**Files:**
- Create: `src/main/modules/ai-processor/providers/gemini.ts`

**Step 1: 创建 gemini.ts 文件**

```typescript
// src/main/modules/ai-processor/providers/gemini.ts

import axios, { AxiosError } from 'axios'
import { BaseAIProvider, DEFAULT_SYSTEM_PROMPT } from './base.js'
import { AIProcessRequest, AiProcessingResponse, AIModelConfig } from '@shared/types/index.js'

/**
 * Google Gemini Provider
 */
export class GeminiProvider extends BaseAIProvider {
  readonly protocol = 'gemini' as const
  readonly id = 'gemini'
  readonly name = 'Google Gemini'

  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  private readonly models: AIModelConfig[] = [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (快速)', isDefault: true },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (实验版)' }
  ]

  async process(request: AIProcessRequest): Promise<AiProcessingResponse> {
    const abortController = this.createAbortController()

    try {
      const response = await axios.post(
        `${this.baseUrl}/models/${request.model}:generateContent`,
        {
          contents: [
            {
              parts: [{ text: request.prompt }]
            }
          ],
          systemInstruction: {
            parts: [{ text: request.systemPrompt || DEFAULT_SYSTEM_PROMPT }]
          },
          generationConfig: {
            maxOutputTokens: request.maxTokens || 4096,
            temperature: request.temperature || 0.3
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          params: {
            key: request.apiKey
          },
          signal: abortController.signal,
          timeout: 60000
        }
      )

      // Gemini 返回格式: candidates[0].content.parts[0].text
      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) {
        return {
          success: true,
          result: text.trim()
        }
      }

      return {
        success: false,
        error: 'API 返回数据格式错误'
      }
    } catch (error) {
      return this.handleApiError(error)
    } finally {
      this.abortController = null
    }
  }

  getAvailableModels(): AIModelConfig[] {
    return this.models
  }

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/models`,
        {
          params: { key: apiKey },
          timeout: 10000
        }
      )
      return response.status === 200
    } catch {
      return false
    }
  }

  private handleApiError(error: unknown): AiProcessingResponse {
    if (this.isAbortError(error)) {
      return { success: false, error: '请求已取消' }
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: { message?: string } }>

      if (axiosError.response) {
        const status = axiosError.response.status
        const message = axiosError.response.data?.error?.message

        switch (status) {
          case 400:
            return { success: false, error: 'API Key 无效' }
          case 429:
            return { success: false, error: '请求过于频繁，请稍后重试' }
          default:
            return { success: false, error: `API 错误: ${message || axiosError.message}` }
        }
      }

      if (axiosError.request) {
        return { success: false, error: '网络错误，请检查网络连接' }
      }
    }

    return this.handleError(error)
  }
}
```

**Step 2: 提交**

```bash
git add src/main/modules/ai-processor/providers/gemini.ts
git commit -m "feat(ai-processor): 添加 Gemini Provider"
```

---

## Task 6: 实现 Provider 注册表

**Files:**
- Create: `src/main/modules/ai-processor/registry.ts`

**Step 1: 创建 registry.ts 文件**

```typescript
// src/main/modules/ai-processor/registry.ts

import { BaseAIProvider } from './providers/base.js'
import { OpenAICompatibleProvider } from './providers/openai-compatible.js'
import { ClaudeProvider } from './providers/claude.js'
import { GeminiProvider } from './providers/gemini.js'
import { AIProviderConfig, AIModelConfig, defaultSettings } from '@shared/types/index.js'

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
        return null
      default:
        console.warn(`[ProviderRegistry] 未知的协议类型: ${config.protocol}`)
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
```

**Step 2: 提交**

```bash
git add src/main/modules/ai-processor/registry.ts
git commit -m "feat(ai-processor): 添加 Provider 注册表"
```

---

## Task 7: 重构 AiProcessorModule

**Files:**
- Modify: `src/main/modules/ai-processor/index.ts`

**Step 1: 重构 ai-processor/index.ts**

将现有的 `AiProcessorModule` 重构为使用 Provider 注册表：

```typescript
// src/main/modules/ai-processor/index.ts

import { EventEmitter } from 'events'
import {
  AiProcessingRequest,
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
  private abortController: AbortController | null = null

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
    if (!apiKey && aiProvider !== 'local') {
      const config = providerRegistry.getConfig(aiProvider)
      return {
        success: false,
        error: `未配置 ${config?.name || aiProvider} API Key`
      }
    }

    // 构建 prompt
    const prompt = this.buildPrompt(text, mode, toneStyle, personalDictionary, targetLanguage)

    // 获取模型
    const model = aiModel || this.getDefaultModel(aiProvider)

    // 构建请求
    const request: AIProcessRequest = {
      prompt,
      model,
      apiKey,
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
   * 翻译文本
   */
  async translate(
    text: string,
    targetLanguage: string,
    settings: UserSettings
  ): Promise<AiProcessingResponse> {
    return this.process(text, 'translate', settings, targetLanguage)
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
    const providerConfig = settings.aiProviders?.find(p => p.id === providerId)
    if (providerConfig?.apiKey) {
      return providerConfig.apiKey
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
```

**Step 2: 提交**

```bash
git add src/main/modules/ai-processor/index.ts
git commit -m "refactor(ai-processor): 重构为使用 Provider 注册表"
```

---

## Task 8: 添加本地 LLM 模块

**Files:**
- Create: `src/main/modules/local-llm/index.ts`
- Create: `src/main/modules/local-llm/model-configs.ts`
- Create: `src/main/modules/ai-processor/providers/local-llm.ts`

**Step 1: 创建 model-configs.ts**

```typescript
// src/main/modules/local-llm/model-configs.ts

import { LocalLLMModel } from '@shared/types/index.js'

/**
 * 内置本地 LLM 模型配置
 */
export const LOCAL_LLM_MODELS: LocalLLMModel[] = [
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    name: 'Qwen2.5 1.5B (轻量)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: '1.1GB',
    sizeBytes: 1.1 * 1024 * 1024 * 1024,
    ramRequired: '2GB',
    recommended: true
  },
  {
    id: 'phi-3.5-mini-instruct-q4_k_m',
    name: 'Phi-3.5 Mini (平衡)',
    url: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf',
    size: '2.2GB',
    sizeBytes: 2.2 * 1024 * 1024 * 1024,
    ramRequired: '4GB',
    recommended: false
  },
  {
    id: 'qwen2.5-3b-instruct-q4_k_m',
    name: 'Qwen2.5 3B (效果优先)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    size: '2.0GB',
    sizeBytes: 2.0 * 1024 * 1024 * 1024,
    ramRequired: '4GB',
    recommended: false
  }
]

/**
 * 国内镜像地址
 */
export const LOCAL_LLM_MIRROR_URLS: Record<string, string[]> = {
  'qwen2.5-1.5b-instruct-q4_k_m': [
    'https://hf-mirror.com/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
  ],
  'phi-3.5-mini-instruct-q4_k_m': [
    'https://hf-mirror.com/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf'
  ],
  'qwen2.5-3b-instruct-q4_k_m': [
    'https://hf-mirror.com/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf'
  ]
}
```

**Step 2: 创建 local-llm/index.ts（基础框架）**

```typescript
// src/main/modules/local-llm/index.ts

import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import { LocalLLMModel, LocalLLMConfig } from '@shared/types/index.js'
import { LOCAL_LLM_MODELS, LOCAL_LLM_MIRROR_URLS } from './model-configs.js'

export class LocalLLMModule extends EventEmitter {
  private process: ChildProcess | null = null
  private currentPort: number = 0
  private isRunning: boolean = false

  /**
   * 获取内置模型列表
   */
  getBuiltinModels(): LocalLLMModel[] {
    return LOCAL_LLM_MODELS.map(model => ({
      ...model,
      downloaded: this.isModelDownloaded(model.id)
    }))
  }

  /**
   * 检查模型是否已下载
   */
  isModelDownloaded(modelId: string): boolean {
    const modelPath = this.getModelPath(modelId)
    return existsSync(modelPath)
  }

  /**
   * 获取模型存储路径
   */
  private getModelsDir(): string {
    // 使用与 Whisper 相同的存储路径
    const userDataPath = app.getPath('userData')
    return join(userDataPath, 'models', 'llm')
  }

  /**
   * 获取模型文件路径
   */
  getModelPath(modelId: string): string {
    return join(this.getModelsDir(), `${modelId}.gguf`)
  }

  /**
   * 获取 llama.cpp 可执行文件路径
   */
  private getLlamaExePath(): string {
    const platform = process.platform
    const exeName = platform === 'win32' ? 'llama-server.exe' : 'llama-server'

    // 先检查资源目录
    const resourcePath = join(process.resourcesPath, 'llama', exeName)
    if (existsSync(resourcePath)) {
      return resourcePath
    }

    // 开发环境路径
    const devPath = join(__dirname, '../../../../resources/llama', exeName)
    if (existsSync(devPath)) {
      return devPath
    }

    return exeName  // 假设在 PATH 中
  }

  /**
   * 启动 llama.cpp 服务
   */
  async startServer(modelId: string, port: number = 8765): Promise<number> {
    if (this.isRunning && this.currentPort === port) {
      return port
    }

    // 停止现有服务
    await this.stopServer()

    const modelPath = this.getModelPath(modelId)
    if (!existsSync(modelPath)) {
      throw new Error('模型文件不存在，请先下载模型')
    }

    const llamaExe = this.getLlamaExePath()

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(llamaExe, [
          '-m', modelPath,
          '--port', String(port),
          '--host', '127.0.0.1',
          '-c', '4096',
          '-ngl', '0',  // CPU 模式
          '--log-disable'
        ])

        this.process.on('error', (error) => {
          console.error('[LocalLLM] 启动失败:', error)
          this.isRunning = false
          reject(error)
        })

        // 等待服务启动
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.isRunning = true
            this.currentPort = port
            console.log(`[LocalLLM] 服务已启动，端口: ${port}`)
            resolve(port)
          }
        }, 2000)

      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 停止服务
   */
  async stopServer(): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.process = null
      this.isRunning = false
      this.currentPort = 0
      console.log('[LocalLLM] 服务已停止')
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): { isRunning: boolean; port: number } {
    return {
      isRunning: this.isRunning,
      port: this.currentPort
    }
  }

  /**
   * 销毁模块
   */
  destroy(): void {
    this.stopServer()
    this.removeAllListeners()
  }
}

// 单例实例
export const localLLMModule = new LocalLLMModule()
```

**Step 3: 创建 local-llm Provider**

```typescript
// src/main/modules/ai-processor/providers/local-llm.ts

import axios from 'axios'
import { BaseAIProvider, DEFAULT_SYSTEM_PROMPT } from './base.js'
import { AIProcessRequest, AiProcessingResponse, AIModelConfig } from '@shared/types/index.js'
import { localLLMModule } from '../../local-llm/index.js'
import { LOCAL_LLM_MODELS } from '../../local-llm/model-configs.js'

/**
 * 本地 LLM Provider
 * 通过 llama.cpp 提供 OpenAI 兼容的本地推理服务
 */
export class LocalLLMProvider extends BaseAIProvider {
  readonly protocol = 'local' as const
  readonly id = 'local'
  readonly name = '本地 LLM (离线)'

  async process(request: AIProcessRequest): Promise<AiProcessingResponse> {
    const abortController = this.createAbortController()

    try {
      // 确保服务已启动
      const port = await localLLMModule.startServer(request.model)

      // 通过 OpenAI 兼容接口调用
      const response = await axios.post(
        `http://localhost:${port}/v1/chat/completions`,
        {
          model: request.model,
          messages: [
            {
              role: 'system',
              content: request.systemPrompt || DEFAULT_SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: request.prompt
            }
          ],
          max_tokens: request.maxTokens || 4096,
          temperature: request.temperature || 0.3,
          stream: false
        },
        {
          signal: abortController.signal,
          timeout: 120000  // 本地推理可能较慢
        }
      )

      if (response.data?.choices?.[0]?.message?.content) {
        return {
          success: true,
          result: response.data.choices[0].message.content.trim()
        }
      }

      return {
        success: false,
        error: '本地模型返回数据格式错误'
      }
    } catch (error) {
      return this.handleError(error)
    } finally {
      this.abortController = null
    }
  }

  getAvailableModels(): AIModelConfig[] {
    return LOCAL_LLM_MODELS.map(model => ({
      id: model.id,
      name: model.name,
      isDefault: model.recommended
    }))
  }

  async validateApiKey(_apiKey: string): Promise<boolean> {
    // 本地模型不需要 API Key
    return true
  }
}
```

**Step 4: 提交**

```bash
git add src/main/modules/local-llm/
git add src/main/modules/ai-processor/providers/local-llm.ts
git commit -m "feat(local-llm): 添加本地 LLM 模块和 Provider"
```

---

## Task 9: 更新 Preload 脚本

**Files:**
- Modify: `src/main/preload.ts`

**Step 1: 添加新的 IPC API**

在 `BeautifulInputAPI` 接口和 `api` 对象中添加新的方法：

```typescript
// 在 BeautifulInputAPI 接口中添加：

  // AI Provider 管理
  getAIProviders: () => Promise<AIProviderConfig[]>
  setAIProvider: (providerId: string, modelId?: string) => Promise<void>
  validateAIApiKey: (providerId: string, apiKey: string) => Promise<boolean>
  addCustomAIProvider: (config: AIProviderConfig) => Promise<boolean>
  removeAIProvider: (providerId: string) => Promise<boolean>

  // 本地 LLM
  getLocalLLMModels: () => Promise<LocalLLMModel[]>
  getLocalLLMStatus: () => Promise<{ isRunning: boolean; port: number }>
```

**Step 2: 在 api 对象中添加实现**

```typescript
  // AI Provider 管理
  getAIProviders: () => ipcRenderer.invoke(IpcChannels.GET_AI_PROVIDERS),
  setAIProvider: (providerId, modelId) => ipcRenderer.invoke(IpcChannels.SET_AI_PROVIDER, providerId, modelId),
  validateAIApiKey: (providerId, apiKey) => ipcRenderer.invoke(IpcChannels.VALIDATE_AI_API_KEY, providerId, apiKey),
  addCustomAIProvider: (config) => ipcRenderer.invoke(IpcChannels.ADD_CUSTOM_AI_PROVIDER, config),
  removeAIProvider: (providerId) => ipcRenderer.invoke(IpcChannels.REMOVE_AI_PROVIDER, providerId),

  // 本地 LLM
  getLocalLLMModels: () => ipcRenderer.invoke(IpcChannels.GET_LOCAL_LLM_MODELS),
  getLocalLLMStatus: () => ipcRenderer.invoke(IpcChannels.GET_LOCAL_LLM_STATUS),
```

**Step 3: 添加类型导入**

```typescript
import { AIProviderConfig, LocalLLMModel } from '@shared/types'
```

**Step 4: 提交**

```bash
git add src/main/preload.ts
git commit -m "feat(preload): 添加 AI Provider 和本地 LLM IPC 接口"
```

---

## Task 10: 更新主进程 IPC 处理

**Files:**
- Modify: `src/main/index.ts`

**Step 1: 添加 IPC 处理器**

在主进程 IPC 处理部分添加：

```typescript
// AI Provider 相关 IPC
ipcMain.handle(IpcChannels.GET_AI_PROVIDERS, async () => {
  return providerRegistry.getAllConfigs()
})

ipcMain.handle(IpcChannels.SET_AI_PROVIDER, async (_, providerId: string, modelId?: string) => {
  const settings = store.get('settings') as UserSettings
  settings.aiProvider = providerId
  if (modelId) {
    settings.aiModel = modelId
  }
  store.set('settings', settings)
})

ipcMain.handle(IpcChannels.VALIDATE_AI_API_KEY, async (_, providerId: string, apiKey: string) => {
  const provider = providerRegistry.getProvider(providerId)
  if (!provider) return false
  return provider.validateApiKey(apiKey)
})

ipcMain.handle(IpcChannels.ADD_CUSTOM_AI_PROVIDER, async (_, config: AIProviderConfig) => {
  return providerRegistry.addCustomProvider(config)
})

ipcMain.handle(IpcChannels.REMOVE_AI_PROVIDER, async (_, providerId: string) => {
  return providerRegistry.removeProvider(providerId)
})

// 本地 LLM 相关 IPC
ipcMain.handle(IpcChannels.GET_LOCAL_LLM_MODELS, async () => {
  return localLLMModule.getBuiltinModels()
})

ipcMain.handle(IpcChannels.GET_LOCAL_LLM_STATUS, async () => {
  return localLLMModule.getStatus()
})
```

**Step 2: 添加必要的导入**

```typescript
import { providerRegistry } from './modules/ai-processor/registry.js'
import { localLLMModule } from './modules/local-llm/index.js'
```

**Step 3: 提交**

```bash
git add src/main/index.ts
git commit -m "feat(main): 添加 AI Provider 和本地 LLM IPC 处理器"
```

---

## Task 11: 更新设置界面 - AI 服务选择

**Files:**
- Modify: `src/renderer/components/Settings.tsx`
- Modify: `src/renderer/Settings.css`

**Step 1: 添加 AI 服务选择组件**

在 Settings.tsx 中，修改 AI 处理服务部分，添加多提供商和模型选择：

```typescript
// 添加状态
const [aiProviders, setAIProviders] = useState<AIProviderConfig[]>([])
const [localLLMModels, setLocalLLMModels] = useState<LocalLLMModel[]>([])
const [localLLMStatus, setLocalLLMStatus] = useState<{ isRunning: boolean; port: number }>({ isRunning: false, port: 0 })

// 加载 AI Providers
const loadAIProviders = async () => {
  try {
    const providers = await window.electronAPI.getAIProviders()
    setAIProviders(providers)
  } catch (error) {
    console.error('加载 AI Providers 失败:', error)
  }
}

// 加载本地 LLM 模型
const loadLocalLLMModels = async () => {
  try {
    const models = await window.electronAPI.getLocalLLMModels()
    setLocalLLMModels(models)
  } catch (error) {
    console.error('加载本地 LLM 模型失败:', error)
  }
}
```

**Step 2: 修改 AI 服务提供商选择 UI**

将现有的简单下拉框改为更完整的服务选择界面：

```tsx
{/* AI 处理服务模块 */}
<div className="api-module">
  <h3 className="module-title">
    <Palette className="module-icon" />
    AI 处理服务
  </h3>
  <p className="module-description">
    用于文本清理、格式化、翻译等 AI 处理功能
  </p>

  {/* 服务提供商选择 */}
  <div className="form-group">
    <label>
      <Key className="label-icon" />
      AI 服务提供商
    </label>
    <select
      value={settings.aiProvider}
      onChange={e => {
        const providerId = e.target.value
        const provider = aiProviders.find(p => p.id === providerId)
        const defaultModel = provider?.models.find(m => m.isDefault)?.id || provider?.models[0]?.id
        updateSetting('aiProvider', providerId)
        if (defaultModel) {
          updateSetting('aiModel', defaultModel)
        }
      }}
    >
      {aiProviders.map(provider => (
        <option key={provider.id} value={provider.id}>
          {provider.name}
        </option>
      ))}
    </select>
  </div>

  {/* 模型选择 */}
  {currentProvider && currentProvider.models.length > 1 && (
    <div className="form-group">
      <label>
        <Settings2 className="label-icon" />
        选择模型
      </label>
      <select
        value={settings.aiModel || ''}
        onChange={e => updateSetting('aiModel', e.target.value)}
      >
        {currentProvider.models.map(model => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
    </div>
  )}

  {/* API Key 输入（非本地服务） */}
  {settings.aiProvider !== 'local' && (
    <ProviderApiKeyInput
      provider={currentProvider}
      apiKey={getAPIKeyForProvider(settings.aiProvider)}
      onApiKeyChange={(key) => updateAPIKeyForProvider(settings.aiProvider, key)}
      onValidate={() => validateProviderApiKey(settings.aiProvider)}
    />
  )}

  {/* 本地 LLM 配置 */}
  {settings.aiProvider === 'local' && (
    <LocalLLMSettings
      models={localLLMModels}
      status={localLLMStatus}
      selectedModel={settings.localLLM?.builtinModelId}
      onSelectModel={(modelId) => updateSetting('localLLM', { ...settings.localLLM, builtinModelId: modelId })}
    />
  )}
</div>
```

**Step 3: 提交**

```bash
git add src/renderer/components/Settings.tsx src/renderer/Settings.css
git commit -m "feat(settings): 添加多 AI 服务提供商选择界面"
```

---

## Task 12: 运行测试和修复

**Step 1: 运行类型检查**

```bash
cd "E:\下载\Kimi_Agent_语音输入工具设计\typeless"
npm run typecheck
```

**Step 2: 修复类型错误**

根据类型检查结果修复错误。

**Step 3: 运行应用测试**

```bash
npm run dev
```

**Step 4: 测试功能清单**

- [ ] 切换 AI 服务提供商
- [ ] 选择不同模型
- [ ] 验证 API Key
- [ ] 录音并使用 AI 处理
- [ ] 切换到本地 LLM（如果已下载模型）

**Step 5: 提交修复**

```bash
git add -A
git commit -m "fix: 修复类型错误和功能问题"
```

---

## Task 13: 完成并合并

**Step 1: 最终代码审查**

检查所有修改的文件，确保：
- 类型定义完整
- 错误处理完善
- UI 界面一致
- 配置迁移兼容旧设置

**Step 2: 更新 README**

更新 README.md 中的功能描述，说明支持多种 AI 服务提供商。

**Step 3: 最终提交**

```bash
git add -A
git commit -m "feat: 完成多 AI 服务提供商支持

- 添加 OpenAI 兼容/Claude/Gemini 协议支持
- 支持提供商内多模型选择
- 添加本地 LLM (llama.cpp) 基础框架
- 重构 AI 处理模块为 Provider 架构
- 更新设置界面支持新的配置方式"
```

---

## 执行顺序总结

| Task | 描述 | 依赖 |
|------|------|------|
| 1 | 扩展类型定义 | - |
| 2 | 创建 Provider 基类 | 1 |
| 3 | 实现 OpenAI 兼容 Provider | 2 |
| 4 | 实现 Claude Provider | 2 |
| 5 | 实现 Gemini Provider | 2 |
| 6 | 实现 Provider 注册表 | 3,4,5 |
| 7 | 重构 AiProcessorModule | 6 |
| 8 | 添加本地 LLM 模块 | 2 |
| 9 | 更新 Preload 脚本 | 1 |
| 10 | 更新主进程 IPC | 6,8,9 |
| 11 | 更新设置界面 | 9,10 |
| 12 | 测试和修复 | 1-11 |
| 13 | 完成并合并 | 12 |
