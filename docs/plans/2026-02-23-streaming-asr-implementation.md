# 流式转录功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现流式语音转录功能，支持边说边显示文字，提供更好的实时体验。

**Architecture:** 采用提供商适配器模式，支持多个云端 ASR 服务（阿里云、智谱、讯飞、Groq）和本地 FunASR。录音模块改造为流式输出，新增预览窗口实时显示识别结果，新增术语管理模块支持自动学习和手动维护。

**Tech Stack:** Electron, TypeScript, WebSocket（流式通信）, FunASR（本地 ASR）

---

## Phase 1: 基础架构（P0）

### Task 1: 添加流式 ASR 相关类型定义

**Files:**
- Modify: `src/shared/types/index.ts`

**Step 1: 添加流式 ASR 提供商类型**

在 `src/shared/types/index.ts` 文件末尾添加以下类型定义：

```typescript
// ===== 流式 ASR 相关类型 =====

/** 流式 ASR 提供商类型 */
export type StreamingASRProvider = 'aliyun' | 'zhipu' | 'xunfei' | 'groq' | 'funasr'

/** 流式 ASR 配置 */
export interface StreamingASRConfig {
  enabled: boolean
  provider: StreamingASRProvider
  mode: 'cloud-first' | 'local-first' | 'local-only'
  // 云端配置
  aliyun?: {
    accessKeyId?: string
    accessKeySecret?: string
    appKey?: string
  }
  zhipu?: {
    apiKey?: string
  }
  xunfei?: {
    appId?: string
    apiKey?: string
    apiSecret?: string
  }
  // 本地 FunASR 配置
  funasr?: {
    enabled: boolean
    modelPath?: string
  }
}

/** 流式 ASR 识别结果 */
export interface StreamingASRResult {
  text: string
  isFinal: boolean
  confidence?: number
  timestamp: number
}

/** 流式 ASR 状态 */
export type StreamingASRStatus = 'idle' | 'connecting' | 'connected' | 'recognizing' | 'error'

/** 流式 ASR 错误 */
export interface StreamingASRError {
  code: string
  message: string
  provider?: StreamingASRProvider
}
```

**Step 2: 在 IpcChannels 枚举中添加新通道**

在 `IpcChannels` 枚举的 `CANCEL_LLM_DOWNLOAD` 之后添加：

```typescript
  // 流式 ASR
  STREAMING_ASR_START: 'streaming-asr:start',
  STREAMING_ASR_STOP: 'streaming-asr:stop',
  STREAMING_ASR_TEXT: 'streaming-asr:text',
  STREAMING_ASR_STATUS: 'streaming-asr:status',
  STREAMING_ASR_ERROR: 'streaming-asr:error',

  // 预览窗口
  PREVIEW_SHOW: 'preview:show',
  PREVIEW_HIDE: 'preview:hide',
  PREVIEW_UPDATE_TEXT: 'preview:update-text',
  PREVIEW_SET_STATUS: 'preview:set-status',

  // 术语管理
  TERM_LIST: 'term:list',
  TERM_ADD: 'term:add',
  TERM_UPDATE: 'term:update',
  TERM_DELETE: 'term:delete',
  TERM_GET_HOTWORDS: 'term:get-hotwords',

  // 文字替换
  GET_SELECTED_TEXT: 'get:selected-text',
  REPLACE_SELECTED_TEXT: 'replace:selected-text',

  // 环境检测
  CHECK_MICROPHONE: 'check-microphone',
  CHECK_NETWORK: 'check-network'
```

**Step 3: 验证类型定义**

Run: `npm run typecheck`
Expected: 无类型错误

**Step 4: Commit**

```bash
git add src/shared/types/index.ts
git commit -m "feat(types): 添加流式 ASR 相关类型定义"
```

---

### Task 2: 创建术语管理类型和存储

**Files:**
- Create: `src/main/modules/term-manager/types.ts`
- Create: `src/main/modules/term-manager/store.ts`

**Step 1: 创建术语类型文件**

创建 `src/main/modules/term-manager/types.ts`：

```typescript
/**
 * 术语管理模块类型定义
 */

/** 术语项 */
export interface Term {
  id: string
  term: string          // 正确术语，如 "Gemini"
  aliases: string[]     // 常见误读，如 ["杰米尼", "吉米尼"]
  source: 'auto' | 'manual'  // 来源：自动学习 / 手动添加
  usageCount: number    // 使用次数（用于排序）
  createdAt: number
  updatedAt: number
}

/** 术语存储结构 */
export interface TermStore {
  version: number
  terms: Term[]
  autoLearningEnabled: boolean
}

/** 术语学习事件 */
export interface TermLearnEvent {
  originalText: string    // 原始识别文本
  correctedText: string   // 用户修正后的文本
  appName?: string        // 来源应用
  timestamp: number
}

/** 热词格式（用于 ASR） */
export interface Hotword {
  term: string
  weight: number  // 权重 1-10
}
```

**Step 2: 创建术语存储文件**

创建 `src/main/modules/term-manager/store.ts`：

```typescript
import Store from 'electron-store'
import { Term, TermStore, Hotword } from './types.js'

const STORE_KEY = 'term-manager'

/** 默认术语存储 */
const defaultTermStore: TermStore = {
  version: 1,
  terms: [],
  autoLearningEnabled: true
}

/**
 * 术语存储管理类
 */
export class TermStore {
  private store: Store

  constructor(store: Store) {
    this.store = store
    this.initialize()
  }

  /**
   * 初始化存储
   */
  private initialize(): void {
    const existing = this.store.get(STORE_KEY)
    if (!existing) {
      this.store.set(STORE_KEY, defaultTermStore)
    }
  }

  /**
   * 获取所有术语
   */
  getAll(): Term[] {
    const data = this.store.get(STORE_KEY) as TermStore
    return data?.terms || []
  }

  /**
   * 添加术语
   */
  add(term: Omit<Term, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>): Term {
    const terms = this.getAll()
    const now = Date.now()
    const newTerm: Term = {
      ...term,
      id: `term-${now}-${Math.random().toString(36).substr(2, 9)}`,
      usageCount: 1,
      createdAt: now,
      updatedAt: now
    }
    terms.push(newTerm)
    this.save(terms)
    return newTerm
  }

  /**
   * 更新术语
   */
  update(id: string, updates: Partial<Omit<Term, 'id' | 'createdAt'>>): Term | null {
    const terms = this.getAll()
    const index = terms.findIndex(t => t.id === id)
    if (index === -1) return null

    terms[index] = {
      ...terms[index],
      ...updates,
      updatedAt: Date.now()
    }
    this.save(terms)
    return terms[index]
  }

  /**
   * 删除术语
   */
  delete(id: string): boolean {
    const terms = this.getAll()
    const index = terms.findIndex(t => t.id === id)
    if (index === -1) return false

    terms.splice(index, 1)
    this.save(terms)
    return true
  }

  /**
   * 增加使用次数
   */
  incrementUsage(id: string): void {
    const terms = this.getAll()
    const term = terms.find(t => t.id === id)
    if (term) {
      term.usageCount++
      term.updatedAt = Date.now()
      this.save(terms)
    }
  }

  /**
   * 获取热词列表（用于 ASR）
   */
  getHotwords(): Hotword[] {
    const terms = this.getAll()
    return terms
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 100)  // 最多 100 个热词
      .map(t => ({
        term: t.term,
        weight: Math.min(10, Math.max(1, Math.floor(t.usageCount / 2) + 1))
      }))
  }

  /**
   * 检查是否启用自动学习
   */
  isAutoLearningEnabled(): boolean {
    const data = this.store.get(STORE_KEY) as TermStore
    return data?.autoLearningEnabled ?? true
  }

  /**
   * 设置自动学习开关
   */
  setAutoLearning(enabled: boolean): void {
    const data = this.store.get(STORE_KEY) as TermStore
    data.autoLearningEnabled = enabled
    this.store.set(STORE_KEY, data)
  }

  /**
   * 保存术语列表
   */
  private save(terms: Term[]): void {
    const data = this.store.get(STORE_KEY) as TermStore
    data.terms = terms
    this.store.set(STORE_KEY, data)
  }
}
```

**Step 3: 运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

**Step 4: Commit**

```bash
git add src/main/modules/term-manager/
git commit -m "feat(term-manager): 添加术语存储模块"
```

---

### Task 3: 创建术语管理模块入口

**Files:**
- Create: `src/main/modules/term-manager/index.ts`

**Step 1: 创建模块入口**

创建 `src/main/modules/term-manager/index.ts`：

```typescript
import Store from 'electron-store'
import { TermStore } from './store.js'
import { Term, TermLearnEvent, Hotword } from './types.js'

/**
 * 术语管理模块
 * 负责术语的存储、学习和热词生成
 */
export class TermManager {
  private store: TermStore

  constructor(electronStore: Store) {
    this.store = new TermStore(electronStore)
  }

  /**
   * 获取所有术语
   */
  getAllTerms(): Term[] {
    return this.store.getAll()
  }

  /**
   * 添加术语（手动）
   */
  addTerm(term: string, aliases: string[] = []): Term {
    return this.store.add({
      term,
      aliases,
      source: 'manual'
    })
  }

  /**
   * 更新术语
   */
  updateTerm(id: string, updates: Partial<Omit<Term, 'id' | 'createdAt'>>): Term | null {
    return this.store.update(id, updates)
  }

  /**
   * 删除术语
   */
  deleteTerm(id: string): boolean {
    return this.store.delete(id)
  }

  /**
   * 从用户修正中学习术语
   * 比较原始文本和修正后的文本，提取可能的术语
   */
  learnFromCorrection(event: TermLearnEvent): Term | null {
    if (!this.store.isAutoLearningEnabled()) {
      return null
    }

    const { originalText, correctedText } = event

    // 简单的差异检测：找出被修正的部分
    const diff = this.findDiff(originalText, correctedText)
    if (!diff) return null

    // 检查是否已存在相同术语
    const existingTerms = this.getAllTerms()
    const existing = existingTerms.find(
      t => t.term === diff.corrected || t.aliases.includes(diff.original)
    )

    if (existing) {
      // 已存在，增加使用次数
      this.store.incrementUsage(existing.id)
      // 如果别名不存在，添加它
      if (!existing.aliases.includes(diff.original)) {
        this.store.update(existing.id, {
          aliases: [...existing.aliases, diff.original]
        })
      }
      return existing
    }

    // 创建新术语
    return this.store.add({
      term: diff.corrected,
      aliases: [diff.original],
      source: 'auto'
    })
  }

  /**
   * 获取热词列表（用于 ASR）
   */
  getHotwords(): Hotword[] {
    return this.store.getHotwords()
  }

  /**
   * 获取术语提示词（用于 AI 处理）
   */
  getTermPrompt(): string {
    const terms = this.getAllTerms()
    if (terms.length === 0) return ''

    const termList = terms
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 50)
      .map(t => `- ${t.term}${t.aliases.length > 0 ? `（注意：可能会被误识别为 ${t.aliases.join('、')}）` : ''}`)
      .join('\n')

    return `用户常用术语列表，请确保这些词汇被正确识别和使用：\n${termList}`
  }

  /**
   * 设置自动学习开关
   */
  setAutoLearning(enabled: boolean): void {
    this.store.setAutoLearning(enabled)
  }

  /**
   * 获取自动学习状态
   */
  isAutoLearningEnabled(): boolean {
    return this.store.isAutoLearningEnabled()
  }

  /**
   * 查找文本差异
   * 返回被修正的部分
   */
  private findDiff(original: string, corrected: string): { original: string; corrected: string } | null {
    // 简单实现：查找第一个不同的连续片段
    const origWords = original.split(/(\s+)/)
    const corrWords = corrected.split(/(\s+)/)

    for (let i = 0; i < Math.max(origWords.length, corrWords.length); i++) {
      if (origWords[i] !== corrWords[i]) {
        // 找到差异
        const origPart = origWords[i]?.trim()
        const corrPart = corrWords[i]?.trim()
        if (origPart && corrPart && origPart !== corrPart) {
          return { original: origPart, corrected: corrPart }
        }
      }
    }

    return null
  }
}

export { Term, TermLearnEvent, Hotword } from './types.js'
```

**Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add src/main/modules/term-manager/index.ts
git commit -m "feat(term-manager): 完成术语管理模块"
```

---

### Task 4: 创建流式 ASR 提供商基类

**Files:**
- Create: `src/main/modules/streaming-asr/types.ts`
- Create: `src/main/modules/streaming-asr/providers/base.ts`

**Step 1: 创建类型定义**

创建 `src/main/modules/streaming-asr/types.ts`：

```typescript
import { StreamingASRProvider, StreamingASRResult, StreamingASRStatus, StreamingASRError } from '@shared/types'

/**
 * 提供商配置接口
 */
export interface ASRProviderConfig {
  provider: StreamingASRProvider
  // 云端配置
  aliyun?: {
    accessKeyId: string
    accessKeySecret: string
    appKey: string
  }
  zhipu?: {
    apiKey: string
  }
  xunfei?: {
    appId: string
    apiKey: string
    apiSecret: string
  }
  groq?: {
    apiKey: string
  }
  // 本地配置
  funasr?: {
    modelPath: string
  }
}

/**
 * 流式 ASR 回调接口
 */
export interface ASRCallbacks {
  onResult: (result: StreamingASRResult) => void
  onStatusChange: (status: StreamingASRStatus) => void
  onError: (error: StreamingASRError) => void
}

/**
 * 音频块信息
 */
export interface AudioChunk {
  data: Buffer
  timestamp: number
}
```

**Step 2: 创建提供商基类**

创建 `src/main/modules/streaming-asr/providers/base.ts`：

```typescript
import { EventEmitter } from 'events'
import { ASRProviderConfig, ASCallbacks, AudioChunk } from '../types.js'
import { StreamingASRProvider, StreamingASRResult, StreamingASRStatus, StreamingASRError } from '@shared/types'

/**
 * 流式 ASR 提供商基类
 * 所有提供商适配器都继承此类
 */
export abstract class BaseASRProvider extends EventEmitter {
  protected config: ASRProviderConfig
  protected callbacks: ASCallbacks
  protected status: StreamingASRStatus = 'idle'
  protected providerName: StreamingASRProvider

  constructor(config: ASRProviderConfig, callbacks: ASCallbacks) {
    super()
    this.config = config
    this.callbacks = callbacks
    this.providerName = config.provider
  }

  /**
   * 初始化提供商
   */
  abstract initialize(): Promise<void>

  /**
   * 开始流式识别
   */
  abstract startStreaming(): Promise<void>

  /**
   * 发送音频数据
   */
  abstract sendAudioChunk(chunk: AudioChunk): void

  /**
   * 停止流式识别
   */
  abstract stopStreaming(): Promise<void>

  /**
   * 检查提供商是否可用
   */
  abstract isAvailable(): Promise<boolean>

  /**
   * 销毁资源
   */
  abstract destroy(): void

  /**
   * 获取提供商名称
   */
  getProviderName(): StreamingASRProvider {
    return this.providerName
  }

  /**
   * 获取当前状态
   */
  getStatus(): StreamingASRStatus {
    return this.status
  }

  /**
   * 更新状态并通知
   */
  protected updateStatus(status: StreamingASRStatus): void {
    this.status = status
    this.callbacks.onStatusChange(status)
    this.emit('status-change', status)
  }

  /**
   * 发送识别结果
   */
  protected sendResult(result: StreamingASRResult): void {
    this.callbacks.onResult(result)
    this.emit('result', result)
  }

  /**
   * 发送错误
   */
  protected sendError(error: StreamingASRError): void {
    this.callbacks.onError(error)
    this.emit('error', error)
  }
}
```

**Step 3: 运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

**Step 4: Commit**

```bash
git add src/main/modules/streaming-asr/
git commit -m "feat(streaming-asr): 添加提供商基类和类型定义"
```

---

### Task 5: 创建阿里云 Paraformer 提供商

**Files:**
- Create: `src/main/modules/streaming-asr/providers/aliyun.ts`

**Step 1: 创建阿里云提供商**

创建 `src/main/modules/streaming-asr/providers/aliyun.ts`：

```typescript
import WebSocket from 'ws'
import crypto from 'crypto'
import { BaseASRProvider } from './base.js'
import { ASRProviderConfig, ASCallbacks, AudioChunk } from '../types.js'
import { StreamingASRResult, StreamingASRStatus, StreamingASRError } from '@shared/types'

/**
 * 阿里云 Paraformer 流式语音识别提供商
 * 使用 WebSocket 实现实时语音识别
 */
export class AliyunASRProvider extends BaseASRProvider {
  private ws: WebSocket | null = null
  private isConnected = false
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 3

  constructor(config: ASRProviderConfig, callbacks: ASCallbacks) {
    super(config, callbacks)
  }

  async initialize(): Promise<void> {
    // 阿里云不需要特殊初始化
    console.log('[AliyunASR] 初始化完成')
  }

  async startStreaming(): Promise<void> {
    if (this.isConnected) {
      console.log('[AliyunASR] 已经连接，跳过')
      return
    }

    this.updateStatus('connecting')

    try {
      const url = await this.buildWebSocketUrl()
      this.ws = new WebSocket(url)

      this.ws.on('open', () => {
        console.log('[AliyunASR] WebSocket 连接成功')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.updateStatus('connected')
        this.sendStartMessage()
      })

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data)
      })

      this.ws.on('error', (error) => {
        console.error('[AliyunASR] WebSocket 错误:', error)
        this.sendError({
          code: 'WEBSOCKET_ERROR',
          message: error.message,
          provider: 'aliyun'
        })
      })

      this.ws.on('close', () => {
        console.log('[AliyunASR] WebSocket 关闭')
        this.isConnected = false
        if (this.status === 'recognizing') {
          this.updateStatus('idle')
        }
      })
    } catch (error) {
      this.updateStatus('error')
      this.sendError({
        code: 'CONNECTION_FAILED',
        message: error instanceof Error ? error.message : '连接失败',
        provider: 'aliyun'
      })
    }
  }

  sendAudioChunk(chunk: AudioChunk): void {
    if (!this.ws || !this.isConnected) {
      console.warn('[AliyunASR] 未连接，无法发送音频')
      return
    }

    if (this.status !== 'recognizing') {
      this.updateStatus('recognizing')
    }

    // 发送音频数据（需要按照阿里云的格式）
    const message = JSON.stringify({
      header: {
        action: 'audio_data'
      },
      payload: {
        audio: chunk.data.toString('base64')
      }
    })
    this.ws.send(message)
  }

  async stopStreaming(): Promise<void> {
    if (!this.ws || !this.isConnected) {
      return
    }

    // 发送结束消息
    const message = JSON.stringify({
      header: {
        action: 'stop'
      }
    })
    this.ws.send(message)

    // 等待最终结果
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        this.ws?.close()
        this.ws = null
        this.isConnected = false
        this.updateStatus('idle')
        resolve()
      }, 500)
    })
  }

  async isAvailable(): Promise<boolean> {
    const config = this.config.aliyun
    return !!(config?.accessKeyId && config?.accessKeySecret && config?.appKey)
  }

  destroy(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    this.removeAllListeners()
  }

  /**
   * 构建 WebSocket URL
   */
  private async buildWebSocketUrl(): Promise<string> {
    const config = this.config.aliyun!
    const region = 'cn-shanghai'
    const host = `nls-gateway.${region}.aliyuncs.com`
    const path = '/ws/v1'

    // 生成签名
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
    const nonce = crypto.randomBytes(16).toString('hex')

    // 简化版 URL（实际需要按照阿里云签名规范）
    const url = `wss://${host}${path}?appkey=${config.appKey}&token=${await this.getToken()}`

    return url
  }

  /**
   * 获取 Token（简化版，实际应该从阿里云获取）
   */
  private async getToken(): Promise<string> {
    // TODO: 实现从阿里云获取 Token 的逻辑
    // 这里返回占位符，实际使用时需要调用阿里云 API 获取
    return 'placeholder-token'
  }

  /**
   * 发送开始消息
   */
  private sendStartMessage(): void {
    if (!this.ws) return

    const message = JSON.stringify({
      header: {
        action: 'start'
      },
      payload: {
        format: 'pcm',
        sample_rate: 16000,
        enable_punctuation: true,
        enable_inverse_text_normalization: true
      }
    })
    this.ws.send(message)
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: Buffer): void {
    try {
      const response = JSON.parse(data.toString())

      if (response.header?.status === 'success') {
        const text = response.payload?.text || ''
        const isFinal = response.header?.action === 'result' && response.payload?.is_final

        this.sendResult({
          text,
          isFinal,
          confidence: response.payload?.confidence,
          timestamp: Date.now()
        })
      } else if (response.header?.status === 'error') {
        this.sendError({
          code: response.header?.error_code || 'UNKNOWN',
          message: response.header?.error_message || '未知错误',
          provider: 'aliyun'
        })
      }
    } catch (error) {
      console.error('[AliyunASR] 解析消息失败:', error)
    }
  }
}
```

**Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

**Step 3: Commit**

```bash
git add src/main/modules/streaming-asr/providers/aliyun.ts
git commit -m "feat(streaming-asr): 添加阿里云 Paraformer 提供商"
```

---

### Task 6: 创建流式 ASR 管理器

**Files:**
- Create: `src/main/modules/streaming-asr/router.ts`
- Create: `src/main/modules/streaming-asr/index.ts`

**Step 1: 创建路由器**

创建 `src/main/modules/streaming-asr/router.ts`：

```typescript
import { BaseASRProvider } from './providers/base.js'
import { AliyunASRProvider } from './providers/aliyun.js'
import { ASRProviderConfig, ASCallbacks } from './types.js'
import { StreamingASRProvider } from '@shared/types'

/**
 * ASR 提供商路由器
 * 根据配置选择合适的提供商
 */
export class ASRRouter {
  private providers: Map<StreamingASRProvider, BaseASRProvider> = new Map()
  private currentProvider: BaseASRProvider | null = null

  /**
   * 注册提供商
   */
  registerProvider(provider: BaseASRProvider): void {
    this.providers.set(provider.getProviderName(), provider)
  }

  /**
   * 获取提供商
   */
  getProvider(name: StreamingASRProvider): BaseASRProvider | undefined {
    return this.providers.get(name)
  }

  /**
   * 设置当前提供商
   */
  async setCurrentProvider(name: StreamingASRProvider): Promise<boolean> {
    const provider = this.providers.get(name)
    if (!provider) {
      console.error(`[ASRRouter] 提供商 ${name} 未注册`)
      return false
    }

    // 检查是否可用
    const available = await provider.isAvailable()
    if (!available) {
      console.error(`[ASRRouter] 提供商 ${name} 不可用`)
      return false
    }

    this.currentProvider = provider
    return true
  }

  /**
   * 获取当前提供商
   */
  getCurrentProvider(): BaseASRProvider | null {
    return this.currentProvider
  }

  /**
   * 获取可用的提供商列表
   */
  async getAvailableProviders(): Promise<StreamingASRProvider[]> {
    const available: StreamingASRProvider[] = []
    for (const [name, provider] of this.providers) {
      if (await provider.isAvailable()) {
        available.push(name)
      }
    }
    return available
  }

  /**
   * 销毁所有提供商
   */
  destroyAll(): void {
    for (const provider of this.providers.values()) {
      provider.destroy()
    }
    this.providers.clear()
    this.currentProvider = null
  }
}

/**
 * 创建提供商实例
 */
export function createProvider(
  name: StreamingASRProvider,
  config: ASRProviderConfig,
  callbacks: ASCallbacks
): BaseASRProvider {
  switch (name) {
    case 'aliyun':
      return new AliyunASRProvider(config, callbacks)
    // 其他提供商在后续任务中添加
    default:
      throw new Error(`不支持的提供商: ${name}`)
  }
}
```

**Step 2: 创建模块入口**

创建 `src/main/modules/streaming-asr/index.ts`：

```typescript
import { EventEmitter } from 'events'
import { ASRRouter, createProvider } from './router.js'
import { ASRProviderConfig, ASCallbacks, AudioChunk } from './types.js'
import { StreamingASRProvider, StreamingASRResult, StreamingASRStatus, StreamingASRError, StreamingASRConfig } from '@shared/types'
import { TermManager } from '../term-manager/index.js'

/**
 * 流式 ASR 管理模块
 * 统一管理所有流式语音识别提供商
 */
export class StreamingASRModule extends EventEmitter {
  private router: ASRRouter
  private termManager: TermManager | null = null
  private config: StreamingASRConfig
  private isRunning = false

  constructor(config: StreamingASRConfig, termManager?: TermManager) {
    super()
    this.config = config
    this.termManager = termManager || null
    this.router = new ASRRouter()
    this.initializeProviders()
  }

  /**
   * 初始化提供商
   */
  private initializeProviders(): void {
    const callbacks: ASCallbacks = {
      onResult: (result) => this.handleResult(result),
      onStatusChange: (status) => this.handleStatusChange(status),
      onError: (error) => this.handleError(error)
    }

    // 初始化阿里云提供商
    if (this.config.aliyun) {
      const provider = createProvider('aliyun', {
        provider: 'aliyun',
        aliyun: this.config.aliyun
      }, callbacks)
      this.router.registerProvider(provider)
    }

    // TODO: 初始化其他提供商
  }

  /**
   * 开始流式识别
   */
  async startStreaming(provider?: StreamingASRProvider): Promise<void> {
    const targetProvider = provider || this.config.provider

    // 设置当前提供商
    const success = await this.router.setCurrentProvider(targetProvider)
    if (!success) {
      // 尝试降级到其他提供商
      const available = await this.router.getAvailableProviders()
      if (available.length === 0) {
        throw new Error('没有可用的语音识别服务')
      }
      await this.router.setCurrentProvider(available[0])
    }

    const currentProvider = this.router.getCurrentProvider()
    if (!currentProvider) {
      throw new Error('无法初始化语音识别服务')
    }

    await currentProvider.initialize()
    await currentProvider.startStreaming()
    this.isRunning = true
  }

  /**
   * 发送音频数据
   */
  sendAudioChunk(chunk: Buffer): void {
    const provider = this.router.getCurrentProvider()
    if (!provider) {
      console.warn('[StreamingASR] 没有活动的提供商')
      return
    }

    provider.sendAudioChunk({
      data: chunk,
      timestamp: Date.now()
    })
  }

  /**
   * 停止流式识别
   */
  async stopStreaming(): Promise<string> {
    const provider = this.router.getCurrentProvider()
    if (!provider) {
      return ''
    }

    await provider.stopStreaming()
    this.isRunning = false
    return ''
  }

  /**
   * 处理识别结果
   */
  private handleResult(result: StreamingASRResult): void {
    this.emit('result', result)
  }

  /**
   * 处理状态变化
   */
  private handleStatusChange(status: StreamingASRStatus): void {
    this.emit('status', status)
  }

  /**
   * 处理错误
   */
  private handleError(error: StreamingASRError): void {
    this.emit('error', error)
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<StreamingASRConfig>): void {
    this.config = { ...this.config, ...config }
    // 重新初始化提供商
    this.router.destroyAll()
    this.initializeProviders()
  }

  /**
   * 获取当前状态
   */
  getStatus(): StreamingASRStatus {
    const provider = this.router.getCurrentProvider()
    return provider?.getStatus() || 'idle'
  }

  /**
   * 检查是否正在运行
   */
  getIsRunning(): boolean {
    return this.isRunning
  }

  /**
   * 销毁模块
   */
  destroy(): void {
    this.router.destroyAll()
    this.removeAllListeners()
  }
}

export { ASRRouter, createProvider } from './router.js'
export { BaseASRProvider } from './providers/base.js'
export { AliyunASRProvider } from './providers/aliyun.js'
export * from './types.js'
```

**Step 3: 运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

**Step 4: Commit**

```bash
git add src/main/modules/streaming-asr/router.ts src/main/modules/streaming-asr/index.ts
git commit -m "feat(streaming-asr): 完成流式 ASR 管理模块"
```

---

## Phase 2: 预览窗口（P0）

### Task 7: 创建预览窗口模块

**Files:**
- Create: `src/main/modules/preview-window/types.ts`
- Create: `src/main/modules/preview-window/index.ts`

**Step 1: 创建类型定义**

创建 `src/main/modules/preview-window/types.ts`：

```typescript
/**
 * 预览窗口类型定义
 */

/** 预览窗口状态 */
export type PreviewStatus = 'recording' | 'processing' | 'success' | 'error'

/** 预览窗口配置 */
export interface PreviewWindowConfig {
  width: number
  maxHeight: number
  opacity: number
  fadeOutDelay: number  // 淡出延迟（毫秒）
}

/** 预览窗口内容 */
export interface PreviewContent {
  text: string
  status: PreviewStatus
  statusText?: string
  isReplaceMode?: boolean  // 是否为替换模式
}

/** 预览窗口位置 */
export interface PreviewPosition {
  x: number
  y: number
}
```

**Step 2: 创建预览窗口模块**

创建 `src/main/modules/preview-window/index.ts`：

```typescript
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { PreviewWindowConfig, PreviewContent, PreviewStatus, PreviewPosition } from './types.js'
import { FloatPosition } from '@shared/types'

/**
 * 预览窗口模块
 * 管理流式识别结果的实时显示
 */
export class PreviewWindow {
  private window: BrowserWindow | null = null
  private config: PreviewWindowConfig
  private hideTimeout: NodeJS.Timeout | null = null
  private currentContent: PreviewContent = {
    text: '',
    status: 'recording'
  }

  constructor(config?: Partial<PreviewWindowConfig>) {
    this.config = {
      width: 300,
      maxHeight: 200,
      opacity: 0.95,
      fadeOutDelay: 2000,
      ...config
    }
  }

  /**
   * 创建预览窗口
   */
  create(floatPosition?: FloatPosition): void {
    if (this.window && !this.window.isDestroyed()) {
      return
    }

    // 计算窗口位置（在悬浮球旁边）
    const position = this.calculatePosition(floatPosition)

    this.window = new BrowserWindow({
      width: this.config.width,
      height: 80,
      maxWidth: this.config.width,
      maxHeight: this.config.maxHeight,
      x: position.x,
      y: position.y,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, '../preload/index.mjs')
      }
    })

    // 加载预览页面
    if (process.env.NODE_ENV === 'development') {
      this.window.loadURL('http://localhost:5173/preview.html')
    } else {
      this.window.loadFile(join(__dirname, '../renderer/preview.html'))
    }

    this.window.webContents.on('did-finish-load', () => {
      // 发送初始内容
      this.updateContent(this.currentContent)
    })
  }

  /**
   * 显示预览窗口
   */
  show(floatPosition?: FloatPosition): void {
    this.clearHideTimeout()

    if (!this.window || this.window.isDestroyed()) {
      this.create(floatPosition)
    } else {
      // 更新位置
      if (floatPosition) {
        const position = this.calculatePosition(floatPosition)
        this.window.setPosition(position.x, position.y)
      }
      this.window.show()
    }
  }

  /**
   * 隐藏预览窗口
   */
  hide(immediate = false): void {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    if (immediate) {
      this.window.hide()
      return
    }

    // 延迟淡出
    this.clearHideTimeout()
    this.hideTimeout = setTimeout(() => {
      if (this.window && !this.window.isDestroyed()) {
        // 发送淡出动画
        this.window.webContents.send('preview-fade-out')
        setTimeout(() => {
          this.window?.hide()
        }, 300)
      }
    }, this.config.fadeOutDelay)
  }

  /**
   * 更新显示内容
   */
  updateContent(content: Partial<PreviewContent>): void {
    this.currentContent = { ...this.currentContent, ...content }

    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('preview-update', this.currentContent)

      // 根据内容调整窗口高度
      this.adjustWindowHeight()
    }
  }

  /**
   * 设置状态
   */
  setStatus(status: PreviewStatus, statusText?: string): void {
    this.updateContent({ status, statusText })
  }

  /**
   * 更新文字
   */
  updateText(text: string): void {
    this.updateContent({ text })
  }

  /**
   * 设置替换模式
   */
  setReplaceMode(isReplace: boolean): void {
    this.updateContent({ isReplaceMode: isReplace })
  }

  /**
   * 销毁窗口
   */
  destroy(): void {
    this.clearHideTimeout()
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null
  }

  /**
   * 计算窗口位置
   */
  private calculatePosition(floatPosition?: FloatPosition): PreviewPosition {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    let x = floatPosition?.x ?? screenWidth - 100
    let y = floatPosition?.y ?? screenHeight - 100

    // 在悬浮球右侧显示
    x = x + 50

    // 确保不超出屏幕边界
    if (x + this.config.width > screenWidth) {
      x = (floatPosition?.x ?? screenWidth - 100) - this.config.width - 10
    }
    if (y + this.config.maxHeight > screenHeight) {
      y = screenHeight - this.config.maxHeight - 10
    }

    return { x, y }
  }

  /**
   * 调整窗口高度
   */
  private adjustWindowHeight(): void {
    if (!this.window || this.window.isDestroyed()) return

    // 根据文字长度估算高度
    const text = this.currentContent.text
    const lines = Math.ceil(text.length / 20)  // 假设每行约 20 个字符
    const height = Math.min(this.config.maxHeight, Math.max(60, 30 + lines * 24))

    this.window.setSize(this.config.width, height)
  }

  /**
   * 清除隐藏超时
   */
  private clearHideTimeout(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }
  }
}
```

**Step 3: 运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

**Step 4: Commit**

```bash
git add src/main/modules/preview-window/
git commit -m "feat(preview-window): 添加预览窗口模块"
```

---

### Task 8: 创建预览窗口渲染页面

**Files:**
- Create: `src/renderer/preview.html`
- Create: `src/renderer/preview.tsx`
- Modify: `electron.vite.config.ts` (添加 preview 入口)

**Step 1: 创建 HTML 文件**

创建 `src/renderer/preview.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: transparent;
      overflow: hidden;
    }
    #root {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./preview.tsx"></script>
</body>
</html>
```

**Step 2: 创建 React 组件**

创建 `src/renderer/preview.tsx`：

```tsx
import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './preview.css'

interface PreviewContent {
  text: string
  status: 'recording' | 'processing' | 'success' | 'error'
  statusText?: string
  isReplaceMode?: boolean
}

const PreviewApp: React.FC = () => {
  const [content, setContent] = useState<PreviewContent>({
    text: '',
    status: 'recording'
  })
  const [isFadingOut, setIsFadingOut] = useState(false)

  useEffect(() => {
    // 监听内容更新
    window.electronAPI?.onPreviewUpdate?.((data: PreviewContent) => {
      setContent(data)
    })

    // 监听淡出动画
    window.electronAPI?.onPreviewFadeOut?.(() => {
      setIsFadingOut(true)
    })
  }, [])

  const getStatusIcon = () => {
    switch (content.status) {
      case 'recording':
        return <span className="status-icon recording">🔴</span>
      case 'processing':
        return <span className="status-icon processing">⏳</span>
      case 'success':
        return <span className="status-icon success">✅</span>
      case 'error':
        return <span className="status-icon error">❌</span>
    }
  }

  const getStatusText = () => {
    if (content.statusText) return content.statusText
    switch (content.status) {
      case 'recording':
        return content.isReplaceMode ? '说出替换内容...' : ''
      case 'processing':
        return 'AI 处理中...'
      case 'success':
        return '已输入'
      case 'error':
        return '出错了'
    }
  }

  return (
    <div className={`preview-container ${isFadingOut ? 'fade-out' : ''}`}>
      {content.isReplaceMode && content.status === 'recording' && (
        <div className="replace-hint">替换模式</div>
      )}
      <div className="preview-text">{content.text || ' '}</div>
      {getStatusText() && (
        <div className={`preview-status ${content.status}`}>
          {getStatusIcon()}
          <span>{getStatusText()}</span>
        </div>
      )}
    </div>
  )
}

// 渲染应用
const container = document.getElementById('root')
if (container) {
  createRoot(container).render(<PreviewApp />)
}
```

**Step 3: 创建样式文件**

创建 `src/renderer/preview.css`：

```css
.preview-container {
  padding: 8px 12px;
  background: rgba(30, 30, 30, 0.95);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  line-height: 1.5;
  transition: opacity 0.3s ease;
}

.preview-container.fade-out {
  opacity: 0;
}

.replace-hint {
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
}

.preview-text {
  min-height: 20px;
  word-break: break-all;
}

.preview-status {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: #888;
}

.preview-status.success {
  color: #4ade80;
}

.preview-status.error {
  color: #f87171;
}

.status-icon {
  font-size: 10px;
}

.status-icon.recording {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

**Step 4: 运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

**Step 5: Commit**

```bash
git add src/renderer/preview.html src/renderer/preview.tsx src/renderer/preview.css
git commit -m "feat(renderer): 添加预览窗口渲染页面"
```

---

## Phase 3: 集成与测试（P0）

### Task 9: 更新 preload 脚本

**Files:**
- Modify: `src/main/preload.ts`

**Step 1: 添加预览窗口和流式 ASR API**

在 `BeautifulInputAPI` 接口中添加：

```typescript
  // 预览窗口
  onPreviewUpdate: (callback: (event: unknown, data: PreviewContent) => void) => void
  onPreviewFadeOut: (callback: () => void) => void

  // 流式 ASR
  onStreamingASRText: (callback: (event: unknown, result: StreamingASRResult) => void) => void
  onStreamingASRStatus: (callback: (event: unknown, status: StreamingASRStatus) => void) => void
  onStreamingASRError: (callback: (event: unknown, error: StreamingASRError) => void) => void

  // 术语管理
  getTerms: () => Promise<Term[]>
  addTerm: (term: string, aliases: string[]) => Promise<Term>
  updateTerm: (id: string, updates: Partial<Term>) => Promise<Term | null>
  deleteTerm: (id: string) => Promise<boolean>
```

在 `api` 对象中添加实现：

```typescript
  // 预览窗口
  onPreviewUpdate: (callback) => {
    ipcRenderer.on(IpcChannels.PREVIEW_UPDATE_TEXT, callback)
  },
  onPreviewFadeOut: (callback) => {
    ipcRenderer.on('preview-fade-out', callback)
  },

  // 流式 ASR
  onStreamingASRText: (callback) => {
    ipcRenderer.on(IpcChannels.STREAMING_ASR_TEXT, callback)
  },
  onStreamingASRStatus: (callback) => {
    ipcRenderer.on(IpcChannels.STREAMING_ASR_STATUS, callback)
  },
  onStreamingASRError: (callback) => {
    ipcRenderer.on(IpcChannels.STREAMING_ASR_ERROR, callback)
  },

  // 术语管理
  getTerms: () => ipcRenderer.invoke(IpcChannels.TERM_LIST),
  addTerm: (term, aliases) => ipcRenderer.invoke(IpcChannels.TERM_ADD, term, aliases),
  updateTerm: (id, updates) => ipcRenderer.invoke(IpcChannels.TERM_UPDATE, id, updates),
  deleteTerm: (id) => ipcRenderer.invoke(IpcChannels.TERM_DELETE, id),
```

**Step 2: 添加导入**

在文件顶部添加导入：

```typescript
import { StreamingASRResult, StreamingASRStatus, StreamingASRError, Term, PreviewContent } from '@shared/types'
```

**Step 3: 运行类型检查**

Run: `npm run typecheck`
Expected: 可能有类型错误（因为 Term 和 PreviewContent 还没在 shared/types 中导出）

**Step 4: 在 shared/types 中导出 Term 类型**

在 `src/shared/types/index.ts` 末尾添加：

```typescript
// 术语相关类型（从 term-manager 模块导出）
export interface Term {
  id: string
  term: string
  aliases: string[]
  source: 'auto' | 'manual'
  usageCount: number
  createdAt: number
  updatedAt: number
}

// 预览窗口类型
export interface PreviewContent {
  text: string
  status: 'recording' | 'processing' | 'success' | 'error'
  statusText?: string
  isReplaceMode?: boolean
}
```

**Step 5: 再次运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

**Step 6: Commit**

```bash
git add src/main/preload.ts src/shared/types/index.ts
git commit -m "feat(preload): 添加预览窗口和流式 ASR API"
```

---

### Task 10: 在主进程中集成流式 ASR

**Files:**
- Modify: `src/main/index.ts`

**Step 1: 导入新模块**

在文件顶部添加导入：

```typescript
import { StreamingASRModule } from './modules/streaming-asr/index.js'
import { PreviewWindow } from './modules/preview-window/index.js'
import { TermManager } from './modules/term-manager/index.js'
```

**Step 2: 初始化模块**

在主进程初始化部分添加：

```typescript
// 初始化术语管理
const termManager = new TermManager(store)

// 初始化预览窗口
const previewWindow = new PreviewWindow()

// 初始化流式 ASR
let streamingASR: StreamingASRModule | null = null
```

**Step 3: 注册 IPC 处理器**

添加流式 ASR 相关的 IPC 处理器：

```typescript
// 流式 ASR IPC 处理
ipcMain.handle(IpcChannels.STREAMING_ASR_START, async (_, provider?: StreamingASRProvider) => {
  if (!streamingASR) {
    const settings = store.get('settings') as UserSettings
    streamingASR = new StreamingASRModule({
      enabled: true,
      provider: provider || 'aliyun',
      mode: 'cloud-first'
    }, termManager)

    streamingASR.on('result', (result: StreamingASRResult) => {
      // 更新预览窗口
      previewWindow.updateText(result.text)
      // 通知渲染进程
      win?.webContents.send(IpcChannels.STREAMING_ASR_TEXT, result)
    })

    streamingASR.on('status', (status: StreamingASRStatus) => {
      win?.webContents.send(IpcChannels.STREAMING_ASR_STATUS, status)
    })

    streamingASR.on('error', (error: StreamingASRError) => {
      win?.webContents.send(IpcChannels.STREAMING_ASR_ERROR, error)
    })
  }

  await streamingASR.startStreaming(provider)
})

ipcMain.handle(IpcChannels.STREAMING_ASR_STOP, async () => {
  if (streamingASR) {
    const text = await streamingASR.stopStreaming()
    return text
  }
  return ''
})

// 预览窗口 IPC 处理
ipcMain.handle(IpcChannels.PREVIEW_SHOW, async () => {
  const floatPosition = await getFloatPosition()
  previewWindow.show(floatPosition)
})

ipcMain.handle(IpcChannels.PREVIEW_HIDE, async (_, immediate = false) => {
  previewWindow.hide(immediate)
})

// 术语管理 IPC 处理
ipcMain.handle(IpcChannels.TERM_LIST, async () => {
  return termManager.getAllTerms()
})

ipcMain.handle(IpcChannels.TERM_ADD, async (_, term: string, aliases: string[]) => {
  return termManager.addTerm(term, aliases)
})

ipcMain.handle(IpcChannels.TERM_UPDATE, async (_, id: string, updates: Partial<Term>) => {
  return termManager.updateTerm(id, updates)
})

ipcMain.handle(IpcChannels.TERM_DELETE, async (_, id: string) => {
  return termManager.deleteTerm(id)
})
```

**Step 4: 运行类型检查**

Run: `npm run typecheck`
Expected: 无类型错误

**Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): 集成流式 ASR 和预览窗口模块"
```

---

## 后续任务（P1/P2）

由于时间关系，以下是后续任务的概述：

### Task 11: FunASR 本地提供商（P1）
- 创建 `src/main/modules/streaming-asr/providers/funasr.ts`
- 实现 FunASR WebSocket 连接
- 处理本地模型下载和初始化

### Task 12: 修改录音模块支持流式输出（P1）
- 修改 `src/main/modules/recording/index.ts`
- 添加 `onData` 回调实时发送音频块到 ASR

### Task 13: 添加更多云端提供商（P2）
- 创建 `src/main/modules/streaming-asr/providers/zhipu.ts`
- 创建 `src/main/modules/streaming-asr/providers/xunfei.ts`
- 创建 `src/main/modules/streaming-asr/providers/groq.ts`

### Task 14: 文字替换功能（P1）
- 实现获取选中文本的逻辑
- 实现替换选中文本的逻辑
- 更新快捷键处理

### Task 15: 设置界面更新（P2）
- 添加流式 ASR 提供商选择
- 添加术语管理页面
- 更新快捷键说明

### Task 16: UI 反馈优化（P2）
- 麦克风检测提示
- 网络状态检测
- 模型下载进度

---

## 测试计划

1. **单元测试**
   - 术语存储和学习的测试
   - ASR 提供商路由测试

2. **集成测试**
   - 流式 ASR 端到端测试
   - 预览窗口显示测试

3. **手动测试**
   - 录音 → 实时文字显示 → 输入
   - 选中文字 → 录音 → 替换
   - 术语学习 → 再次识别测试
