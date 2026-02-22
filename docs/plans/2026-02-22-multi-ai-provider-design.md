# 多 AI 服务提供商支持设计

## 概述

扩展 AI 处理模块，支持多种 AI 服务提供商和本地 LLM，实现：
1. **多模型选择** - 在现有提供商内支持选择具体模型
2. **自定义服务提供商** - 支持添加 OpenAI 兼容/Claude/Gemini 等各类 API
3. **本地 LLM** - 离线轻量级模型实现完全不联网

## 架构方案

采用 **统一 Provider 抽象层** 架构：

```
AIProvider (抽象接口)
├── OpenAICompatibleProvider    # OpenAI/DeepSeek/Qwen/GLM/Groq 等
├── ClaudeProvider              # Anthropic Claude
├── GeminiProvider              # Google Gemini
└── LocalLLMProvider            # llama.cpp 本地
```

## 模块结构

```
src/main/modules/
├── ai-processor/
│   ├── index.ts                    # 模块入口（重构）
│   ├── providers/
│   │   ├── base.ts                 # AIProvider 抽象基类
│   │   ├── openai-compatible.ts    # OpenAI 兼容格式
│   │   ├── claude.ts               # Anthropic Claude
│   │   ├── gemini.ts               # Google Gemini
│   │   └── local-llm.ts            # 本地 llama.cpp
│   ├── registry.ts                 # 服务提供商注册表
│   └── prompts.ts                  # Prompt 模板管理
├── local-llm/                      # 本地 LLM 管理模块
│   ├── index.ts                    # 模块入口
│   ├── downloader.ts               # 模型下载器
│   ├── process-manager.ts          # llama.cpp 进程管理
│   └── model-configs.ts            # 内置模型配置
```

## 核心接口

### AIProvider 抽象接口

```typescript
// src/main/modules/ai-processor/providers/base.ts

/** AI 服务提供商抽象接口 */
export interface AIProvider {
  /** 提供商标识 */
  readonly id: string
  /** 提供商名称 */
  readonly name: string
  /** 协议类型 */
  readonly protocol: 'openai-compatible' | 'claude' | 'gemini' | 'local'

  /** 执行文本处理 */
  process(request: AIProcessRequest): Promise<AIProcessingResponse>

  /** 获取可用模型列表 */
  getAvailableModels(): AIModel[]

  /** 验证 API Key */
  validateApiKey(apiKey: string): Promise<boolean>

  /** 取消当前请求 */
  cancel(): void
}

/** AI 处理请求 */
export interface AIProcessRequest {
  prompt: string
  model: string
  apiKey?: string
  baseUrl?: string
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}

/** 模型信息 */
export interface AIModel {
  id: string
  name: string
  maxTokens?: number
  isDefault?: boolean
}
```

## 各协议 Provider 实现

### OpenAI 兼容 Provider

适用于：OpenAI、DeepSeek、Qwen、GLM、Groq 以及用户自定义的 OpenAI 兼容服务

```typescript
// providers/openai-compatible.ts
export class OpenAICompatibleProvider implements AIProvider {
  readonly protocol = 'openai-compatible'

  constructor(
    public readonly id: string,
    public readonly name: string,
    private readonly defaultBaseUrl: string,
    private readonly defaultModel: string,
    private readonly models: AIModel[]
  ) {}

  async process(request: AIProcessRequest): Promise<AIProcessingResponse> {
    // 统一的 OpenAI 格式 API 调用
    const response = await axios.post(
      `${request.baseUrl || this.defaultBaseUrl}/chat/completions`,
      {
        model: request.model,
        messages: [
          { role: 'system', content: request.systemPrompt || DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: request.prompt }
        ],
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature || 0.3,
        stream: false
      },
      {
        headers: { 'Authorization': `Bearer ${request.apiKey}` },
        timeout: 30000
      }
    )
    // ... 错误处理
  }
}
```

### Claude Provider

```typescript
// providers/claude.ts
export class ClaudeProvider implements AIProvider {
  readonly protocol = 'claude'

  async process(request: AIProcessRequest): Promise<AIProcessingResponse> {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
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
          'content-type': 'application/json'
        }
      }
    )
    // Claude 返回格式: content[0].text
  }
}
```

### Gemini Provider

```typescript
// providers/gemini.ts
export class GeminiProvider implements AIProvider {
  readonly protocol = 'gemini'

  async process(request: AIProcessRequest): Promise<AIProcessingResponse> {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent`,
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
        headers: { 'Content-Type': 'application/json' },
        params: { key: request.apiKey }
      }
    )
    // Gemini 返回格式: candidates[0].content.parts[0].text
  }
}
```

### 本地 LLM Provider

```typescript
// providers/local-llm.ts
export class LocalLLMProvider implements AIProvider {
  readonly protocol = 'local'

  constructor(private readonly processManager: LocalLLMProcessManager) {}

  async process(request: AIProcessRequest): Promise<AIProcessingResponse> {
    // 确保 llama.cpp 服务已启动
    const port = await this.processManager.ensureRunning(request.model)

    // 通过 OpenAI 兼容接口调用本地服务
    const response = await axios.post(
      `http://localhost:${port}/v1/chat/completions`,
      {
        model: request.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.prompt }
        ],
        max_tokens: request.maxTokens,
        temperature: request.temperature
      }
    )
    return this.parseResponse(response)
  }
}
```

## 本地 LLM 模块

### llama.cpp 集成

```typescript
// src/main/modules/local-llm/index.ts
export class LocalLLMModule {
  private process: ChildProcess | null = null
  private currentPort: number = 0

  /** 内置模型配置 */
  static BUILTIN_MODELS: LocalModel[] = [
    {
      id: 'qwen2.5-1.5b-instruct',
      name: 'Qwen2.5 1.5B (轻量)',
      url: 'https://huggingface.co/.../qwen2.5-1.5b-instruct-q4_k_m.gguf',
      size: '1.1GB',
      ramRequired: '2GB',
      recommended: true
    },
    {
      id: 'phi-3.5-mini',
      name: 'Phi-3.5 Mini (平衡)',
      url: 'https://huggingface.co/.../phi-3.5-mini-q4_k_m.gguf',
      size: '2.2GB',
      ramRequired: '4GB',
      recommended: false
    },
    {
      id: 'qwen2.5-3b-instruct',
      name: 'Qwen2.5 3B (效果优先)',
      url: 'https://huggingface.co/.../qwen2.5-3b-instruct-q4_k_m.gguf',
      size: '2.0GB',
      ramRequired: '4GB',
      recommended: false
    }
  ]

  /** 启动 llama.cpp 服务 */
  async startServer(modelPath: string, port: number): Promise<void> {
    const llamaExe = this.getLlamaExePath()
    this.process = spawn(llamaExe, [
      '-m', modelPath,
      '--port', String(port),
      '--host', '127.0.0.1',
      '-c', '4096',
      '-ngl', '0',  // CPU 模式
      '--log-disable'
    ])
  }

  /** 停止服务 */
  async stopServer(): Promise<void> {
    if (this.process) {
      this.process.kill()
      this.process = null
    }
  }
}
```

## 配置数据结构

```typescript
// @shared/types/index.ts

/** AI 服务提供商配置 */
export interface AIProviderConfig {
  id: string
  name: string
  protocol: 'openai-compatible' | 'claude' | 'gemini' | 'local'
  baseUrl?: string
  apiKey?: string
  models: AIModelConfig[]
  defaultModel?: string
  isEnabled: boolean
  isBuiltIn?: boolean  // 是否为内置提供商
}

/** 模型配置 */
export interface AIModelConfig {
  id: string
  name: string
  maxTokens?: number
  isEnabled?: boolean
}

/** 本地 LLM 配置 */
export interface LocalLLMConfig {
  enabled: boolean
  modelPath?: string       // 自定义模型路径
  builtinModelId?: string  // 使用的内置模型 ID
  port: number             // 本地服务端口
  autoStart: boolean       // 是否随应用启动
}

/** 用户设置扩展 */
export interface UserSettings {
  // ... 现有字段

  // 新增 AI 配置
  aiProvider: string              // 当前选中的提供商 ID
  aiModel: string                 // 当前选中的模型 ID
  aiProviders: AIProviderConfig[] // 所有提供商配置
  localLLM: LocalLLMConfig        // 本地 LLM 配置
}
```

## 设置 UI

设置窗口新增 "AI 服务" 配置区域：

```
┌─────────────────────────────────────────────────────┐
│ AI 服务配置                                          │
├─────────────────────────────────────────────────────┤
│ 当前服务: [ DeepSeek ▼ ]                            │
│ 当前模型: [ deepseek-chat ▼ ]                       │
│ API Key:   [ •••••••••••••••• ] [验证]              │
│                                                     │
│ ─────────────────────────────────────────────────── │
│ 可用服务                                             │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ○ DeepSeek          已配置 ✓                    │ │
│ │ ○ 千问 (Qwen)       已配置 ✓                    │ │
│ │ ○ Groq Whisper     未配置                        │ │
│ │ ○ Claude (Anthropic) 未配置                      │ │
│ │ ○ Google Gemini    未配置                        │ │
│ │ ○ 本地 LLM (离线)  未下载                        │ │
│ │ ○ 自定义服务...                                   │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ [添加自定义服务]                                     │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 本地 LLM 设置（离线模式）                            │
├─────────────────────────────────────────────────────┤
│ 启用本地 LLM: [ ]                                   │
│                                                     │
│ 模型选择:                                           │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ○ Qwen2.5 1.5B (轻量)    1.1GB    [下载]        │ │
│ │   适合低配置设备，需 2GB 内存                    │ │
│ │ ○ Phi-3.5 Mini (平衡)    2.2GB    [下载]        │ │
│ │   效果与速度平衡，需 4GB 内存                    │ │
│ │ ○ Qwen2.5 3B (效果优先)  2.0GB    [下载]        │ │
│ │   最佳效果，需 4GB 内存                          │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ 自定义模型路径: [                    ] [选择文件]   │
│ 模型存储位置: [                    ] [选择目录]   │
└─────────────────────────────────────────────────────┘
```

## 数据流

```
用户录音完成
     │
     ▼
┌─────────────────┐
│ transcribe 音频 │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 选择 AI Provider│ ←── 根据 settings.aiProvider
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 构建 Prompt     │ ←── 根据 mode, toneStyle, personalDictionary
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Provider.process│
│                 │
│ ┌─────────────┐ │
│ │本地LLM?     │ │──Yes──▶ 启动/复用 llama.cpp → localhost API
│ └─────────────┘ │
│         │No     │
│         ▼       │
│ ┌─────────────┐ │
│ │Claude?      │ │──Yes──▶ Anthropic API
│ └─────────────┘ │
│         │No     │
│         ▼       │
│ ┌─────────────┐ │
│ │Gemini?      │ │──Yes──▶ Google API
│ └─────────────┘ │
│         │No     │
│         ▼       │
│  OpenAI 兼容 API │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 返回处理结果    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ input-simulator │
└─────────────────┘
```

## 预置服务提供商

```typescript
// registry.ts 内置提供商列表
export const BUILTIN_PROVIDERS: AIProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    isBuiltIn: true,
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
    models: [
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (快速)', isDefault: true },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' }
    ]
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    isBuiltIn: true,
    models: [
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (快速)', isDefault: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
    ]
  },
  {
    id: 'glm',
    name: '智谱 GLM',
    protocol: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    isBuiltIn: true,
    models: [
      { id: 'glm-4-flash', name: 'GLM-4 Flash (免费)', isDefault: true },
      { id: 'glm-4', name: 'GLM-4' }
    ]
  },
  {
    id: 'local',
    name: '本地 LLM (离线)',
    protocol: 'local',
    isBuiltIn: true,
    models: []  // 动态从 LocalLLMModule 获取
  }
]
```

## 模块职责总结

| 模块 | 功能 | 关键文件 |
|------|------|----------|
| **Provider 抽象层** | 统一 AI 服务接口 | `providers/base.ts` |
| **OpenAI 兼容** | DeepSeek/Qwen/GLM/Groq/自定义 | `providers/openai-compatible.ts` |
| **Claude** | Anthropic API 适配 | `providers/claude.ts` |
| **Gemini** | Google API 适配 | `providers/gemini.ts` |
| **本地 LLM** | llama.cpp 集成 | `providers/local-llm.ts` |
| **注册表** | 管理所有提供商 | `registry.ts` |
| **本地 LLM 模块** | 模型下载、进程管理 | `local-llm/index.ts` |
| **设置 UI** | 服务配置界面 | `Settings.tsx` |
