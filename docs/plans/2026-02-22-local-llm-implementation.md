# 本地 LLM 功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完善本地 LLM 功能，实现硬件检测、模型下载、多后端支持和设置界面。

**Architecture:** 基于 llama.cpp 提供 OpenAI 兼容 API，支持 CPU/CUDA/Metal 多后端，内置模型库，硬件检测自动推荐配置。

**Tech Stack:** TypeScript, Electron, llama.cpp, axios, child_process

---

## Task 1: 更新类型定义

**Files:**
- Modify: `src/shared/types/index.ts`

**Step 1: 更新 LocalLLMModel 接口**

在 `src/shared/types/index.ts` 中找到 `LocalLLMModel` 接口，添加新字段：

```typescript
// 找到 LocalLLMModel 接口并更新
export interface LocalLLMModel {
  id: string
  name: string
  description?: string    // 新增：模型描述
  url: string
  size: string
  sizeBytes: number
  ramRequired: string
  mirrorUrls?: string[]   // 新增：国内镜像
  recommended?: boolean
  downloaded?: boolean
  gpuRecommended?: boolean // 新增：是否推荐 GPU
}
```

**Step 2: 添加 LLMHardwareInfo 接口**

在文件末尾添加：

```typescript
// ===== 本地 LLM 硬件检测相关 =====

export interface LLMHardwareInfo {
  platform: 'win32' | 'darwin' | 'linux'
  hasNvidia: boolean
  nvidiaGpuName?: string
  vram?: number          // MB
  isAppleSilicon: boolean
  totalMemory: number    // GB
  recommendedBackend: 'cpu' | 'cuda' | 'metal'
  recommendedModel: string  // 推荐的模型 ID
}

export interface LLMDownloadProgress {
  modelId: string
  status: 'idle' | 'downloading' | 'completed' | 'error' | 'cancelled'
  progress: number       // 0-100
  downloaded: number     // bytes
  totalSize: number      // bytes
  speed?: string
  error?: string
}
```

**Step 3: 添加新的 IPC 通道**

在 `IpcChannels` 枚举中添加：

```typescript
  // 本地 LLM 相关（新增）
  DETECT_LLM_HARDWARE = 'detect-llm-hardware',
  START_LOCAL_LLM = 'start-local-llm',
  STOP_LOCAL_LLM = 'stop-local-llm',
  DOWNLOAD_LOCAL_LLM_MODEL = 'download-local-llm-model',
  CANCEL_LLM_DOWNLOAD = 'cancel-llm-download',
  LLM_DOWNLOAD_PROGRESS = 'llm-download-progress',
```

**Step 4: 运行类型检查**

```bash
cd "E:\下载\Kimi_Agent_语音输入工具设计\typeless"
npm run typecheck
```

Expected: 新增类型应无语法错误

**Step 5: 提交**

```bash
git add src/shared/types/index.ts
git commit -m "feat(types): 添加本地 LLM 硬件检测和下载进度类型"
```

---

## Task 2: 更新模型配置

**Files:**
- Modify: `src/main/modules/local-llm/model-configs.ts`

**Step 1: 更新模型配置，添加描述和镜像**

```typescript
// src/main/modules/local-llm/model-configs.ts

import { LocalLLMModel } from '@shared/types/index.js'

/**
 * 内置本地 LLM 模型配置
 */
export const LOCAL_LLM_MODELS: LocalLLMModel[] = [
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    name: 'Qwen2.5 1.5B',
    description: '轻量级，适合低配设备',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: '1.1 GB',
    sizeBytes: 1.1 * 1024 * 1024 * 1024,
    ramRequired: '2 GB',
    mirrorUrls: [
      'https://hf-mirror.com/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
    ],
    recommended: true,
    gpuRecommended: false
  },
  {
    id: 'qwen2.5-3b-instruct-q4_k_m',
    name: 'Qwen2.5 3B',
    description: '平衡性能与效果',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    size: '2.0 GB',
    sizeBytes: 2.0 * 1024 * 1024 * 1024,
    ramRequired: '4 GB',
    mirrorUrls: [
      'https://hf-mirror.com/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf'
    ],
    recommended: false,
    gpuRecommended: false
  },
  {
    id: 'phi-3.5-mini-instruct-q4_k_m',
    name: 'Phi-3.5 Mini',
    description: '微软出品，多语言支持好',
    url: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf',
    size: '2.2 GB',
    sizeBytes: 2.2 * 1024 * 1024 * 1024,
    ramRequired: '4 GB',
    mirrorUrls: [
      'https://hf-mirror.com/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf'
    ],
    recommended: false,
    gpuRecommended: false
  },
  {
    id: 'qwen2.5-7b-instruct-q4_k_m',
    name: 'Qwen2.5 7B',
    description: '最佳效果，需要较好硬件',
    url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
    size: '4.7 GB',
    sizeBytes: 4.7 * 1024 * 1024 * 1024,
    ramRequired: '8 GB',
    mirrorUrls: [
      'https://hf-mirror.com/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf'
    ],
    recommended: false,
    gpuRecommended: true
  }
]

/**
 * 国内镜像地址（保留兼容）
 */
export const LOCAL_LLM_MIRROR_URLS: Record<string, string[]> = {
  'qwen2.5-1.5b-instruct-q4_k_m': [
    'https://hf-mirror.com/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
  ],
  'qwen2.5-3b-instruct-q4_k_m': [
    'https://hf-mirror.com/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf'
  ],
  'phi-3.5-mini-instruct-q4_k_m': [
    'https://hf-mirror.com/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf'
  ],
  'qwen2.5-7b-instruct-q4_k_m': [
    'https://hf-mirror.com/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf'
  ]
}
```

**Step 2: 提交**

```bash
git add src/main/modules/local-llm/model-configs.ts
git commit -m "feat(local-llm): 更新模型配置，添加描述和镜像地址"
```

---

## Task 3: 创建硬件检测器

**Files:**
- Create: `src/main/modules/local-llm/hardware-detector.ts`

**Step 1: 创建硬件检测器**

```typescript
// src/main/modules/local-llm/hardware-detector.ts

import { exec } from 'child_process'
import { promisify } from 'util'
import { platform, totalmem } from 'os'
import { LLMHardwareInfo } from '@shared/types/index.js'
import { LOCAL_LLM_MODELS } from './model-configs.js'

const execAsync = promisify(exec)

export class LLMHardwareDetector {
  /**
   * 检测硬件信息并推荐配置
   */
  async detect(): Promise<LLMHardwareInfo> {
    const currentPlatform = platform() as 'win32' | 'darwin' | 'linux'

    const result: LLMHardwareInfo = {
      platform: currentPlatform,
      hasNvidia: false,
      isAppleSilicon: false,
      totalMemory: Math.round(totalmem() / (1024 * 1024 * 1024)),
      recommendedBackend: 'cpu',
      recommendedModel: LOCAL_LLM_MODELS[0].id
    }

    // 检测 NVIDIA GPU
    if (currentPlatform === 'win32' || currentPlatform === 'linux') {
      const nvidiaInfo = await this.detectNvidia()
      result.hasNvidia = nvidiaInfo.hasNvidia
      result.nvidiaGpuName = nvidiaInfo.name
      result.vram = nvidiaInfo.vram
      if (nvidiaInfo.hasNvidia) {
        result.recommendedBackend = 'cuda'
      }
    }

    // 检测 Apple Silicon
    if (currentPlatform === 'darwin') {
      result.isAppleSilicon = await this.detectAppleSilicon()
      if (result.isAppleSilicon) {
        result.recommendedBackend = 'metal'
      }
    }

    // 推荐模型
    result.recommendedModel = this.recommendModel(result)

    return result
  }

  /**
   * 检测 NVIDIA GPU
   */
  private async detectNvidia(): Promise<{
    hasNvidia: boolean
    name?: string
    vram?: number
  }> {
    try {
      const cmd = platform() === 'win32'
        ? 'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits'
        : 'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null'

      const { stdout } = await execAsync(cmd, { timeout: 5000 })
      const lines = stdout.trim().split('\n')

      if (lines.length > 0 && lines[0].trim()) {
        const [name, vram] = lines[0].split(',').map(s => s.trim())
        return {
          hasNvidia: true,
          name,
          vram: parseInt(vram, 10)
        }
      }
    } catch {
      // nvidia-smi 不可用
    }

    return { hasNvidia: false }
  }

  /**
   * 检测 Apple Silicon
   */
  private async detectAppleSilicon(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('sysctl -n machdep.cpu.brand_string', {
        timeout: 3000
      })
      return stdout.includes('Apple') || stdout.includes('M1') || stdout.includes('M2') || stdout.includes('M3') || stdout.includes('M4')
    } catch {
      return false
    }
  }

  /**
   * 根据硬件推荐模型
   */
  private recommendModel(hw: LLMHardwareInfo): string {
    // GPU 用户或大内存 -> 推荐更大的模型
    if (hw.recommendedBackend !== 'cpu' || hw.totalMemory >= 16) {
      const model = LOCAL_LLM_MODELS.find(m => m.id === 'qwen2.5-3b-instruct-q4_k_m')
      return model?.id || LOCAL_LLM_MODELS[0].id
    }

    // 8-16GB 内存 -> 中等模型
    if (hw.totalMemory >= 8) {
      const model = LOCAL_LLM_MODELS.find(m => m.id === 'qwen2.5-1.5b-instruct-q4_k_m')
      return model?.id || LOCAL_LLM_MODELS[0].id
    }

    // 低配设备 -> 最小模型
    return LOCAL_LLM_MODELS[0].id
  }
}

// 单例
export const llmHardwareDetector = new LLMHardwareDetector()
```

**Step 2: 提交**

```bash
git add src/main/modules/local-llm/hardware-detector.ts
git commit -m "feat(local-llm): 添加硬件检测器"
```

---

## Task 4: 创建模型下载器

**Files:**
- Create: `src/main/modules/local-llm/downloader.ts`

**Step 1: 创建下载器**

```typescript
// src/main/modules/local-llm/downloader.ts

import { EventEmitter } from 'events'
import { createWriteStream, existsSync, unlinkSync } from 'fs'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import axios from 'axios'
import { LocalLLMModel, LLMDownloadProgress } from '@shared/types/index.js'

export class LLMModelDownloader extends EventEmitter {
  private abortControllers: Map<string, AbortController> = new Map()

  /**
   * 下载模型
   */
  async downloadModel(model: LocalLLMModel, modelsDir: string): Promise<string> {
    const targetPath = join(modelsDir, `${model.id}.gguf`)

    // 已存在则跳过
    if (existsSync(targetPath)) {
      this.emit('progress', {
        modelId: model.id,
        status: 'completed',
        progress: 100,
        downloaded: model.sizeBytes,
        totalSize: model.sizeBytes
      } as LLMDownloadProgress)
      return targetPath
    }

    // 确保目录存在
    await mkdir(modelsDir, { recursive: true })

    // 尝试主地址和镜像
    const urls = [model.url, ...(model.mirrorUrls || [])]

    for (const url of urls) {
      try {
        const result = await this.downloadFile(url, targetPath, model)
        return result
      } catch (error) {
        console.warn(`[LLMDownloader] 下载失败 ${url}:`, error)
        // 删除部分下载的文件
        if (existsSync(targetPath)) {
          try { unlinkSync(targetPath) } catch {}
        }
      }
    }

    const error = new Error('所有下载地址均失败')
    this.emit('progress', {
      modelId: model.id,
      status: 'error',
      progress: 0,
      downloaded: 0,
      totalSize: model.sizeBytes,
      error: error.message
    } as LLMDownloadProgress)
    throw error
  }

  /**
   * 下载单个文件
   */
  private async downloadFile(
    url: string,
    targetPath: string,
    model: LocalLLMModel
  ): Promise<string> {
    const abortController = new AbortController()
    this.abortControllers.set(model.id, abortController)

    try {
      this.emit('progress', {
        modelId: model.id,
        status: 'downloading',
        progress: 0,
        downloaded: 0,
        totalSize: model.sizeBytes
      } as LLMDownloadProgress)

      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        signal: abortController.signal,
        timeout: 30000
      })

      const totalSize = parseInt(response.headers['content-length'] || '0', 10) || model.sizeBytes
      const writer = createWriteStream(targetPath)
      let downloaded = 0
      let lastEmit = 0

      response.data.on('data', (chunk: Buffer) => {
        downloaded += chunk.length
        const progress = Math.round((downloaded / totalSize) * 100)

        // 每 500ms 发送一次进度
        const now = Date.now()
        if (now - lastEmit > 500) {
          lastEmit = now
          this.emit('progress', {
            modelId: model.id,
            status: 'downloading',
            progress,
            downloaded,
            totalSize
          } as LLMDownloadProgress)
        }
      })

      response.data.pipe(writer)

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve)
        writer.on('error', reject)
        response.data.on('error', reject)
      })

      this.emit('progress', {
        modelId: model.id,
        status: 'completed',
        progress: 100,
        downloaded: totalSize,
        totalSize
      } as LLMDownloadProgress)

      return targetPath
    } finally {
      this.abortControllers.delete(model.id)
    }
  }

  /**
   * 取消下载
   */
  cancelDownload(modelId: string): void {
    const controller = this.abortControllers.get(modelId)
    if (controller) {
      controller.abort()
      this.abortControllers.delete(modelId)
      this.emit('progress', {
        modelId,
        status: 'cancelled',
        progress: 0,
        downloaded: 0,
        totalSize: 0
      } as LLMDownloadProgress)
    }
  }

  /**
   * 删除模型
   */
  deleteModel(modelId: string, modelsDir: string): boolean {
    const modelPath = join(modelsDir, `${modelId}.gguf`)
    if (existsSync(modelPath)) {
      try {
        unlinkSync(modelPath)
        return true
      } catch {
        return false
      }
    }
    return false
  }
}

// 单例
export const llmModelDownloader = new LLMModelDownloader()
```

**Step 2: 提交**

```bash
git add src/main/modules/local-llm/downloader.ts
git commit -m "feat(local-llm): 添加模型下载器"
```

---

## Task 5: 更新 LocalLLMModule 主模块

**Files:**
- Modify: `src/main/modules/local-llm/index.ts`

**Step 1: 重写主模块，整合所有功能**

```typescript
// src/main/modules/local-llm/index.ts

import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import axios from 'axios'
import { LocalLLMModel, LocalLLMConfig, LLMHardwareInfo, LLMDownloadProgress } from '@shared/types/index.js'
import { LOCAL_LLM_MODELS } from './model-configs.js'
import { llmHardwareDetector, LLMHardwareDetector } from './hardware-detector.js'
import { llmModelDownloader, LLMModelDownloader } from './downloader.js'

export interface LLMStatus {
  isRunning: boolean
  port: number
  model: string
  backend: 'cpu' | 'cuda' | 'metal'
}

export class LocalLLMModule extends EventEmitter {
  private process: ChildProcess | null = null
  private currentPort: number = 0
  private isRunning: boolean = false
  private currentModel: string = ''
  private currentBackend: 'cpu' | 'cuda' | 'metal' = 'cpu'
  private hardwareInfo: LLMHardwareInfo | null = null
  private config: LocalLLMConfig | null = null

  // 暴露子模块
  readonly hardwareDetector = llmHardwareDetector
  readonly downloader = llmModelDownloader

  constructor() {
    super()

    // 转发下载进度事件
    this.downloader.on('progress', (progress: LLMDownloadProgress) => {
      this.emit('download-progress', progress)
    })
  }

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
   * 获取模型存储目录
   */
  getModelsDir(): string {
    // 使用与 Whisper 相同的基础路径
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
   * 检测硬件
   */
  async detectHardware(): Promise<LLMHardwareInfo> {
    this.hardwareInfo = await this.hardwareDetector.detect()
    return this.hardwareInfo
  }

  /**
   * 获取缓存的硬件信息
   */
  getHardwareInfo(): LLMHardwareInfo | null {
    return this.hardwareInfo
  }

  /**
   * 下载模型
   */
  async downloadModel(modelId: string): Promise<string> {
    const model = LOCAL_LLM_MODELS.find(m => m.id === modelId)
    if (!model) {
      throw new Error(`未找到模型: ${modelId}`)
    }
    return this.downloader.downloadModel(model, this.getModelsDir())
  }

  /**
   * 取消下载
   */
  cancelDownload(modelId: string): void {
    this.downloader.cancelDownload(modelId)
  }

  /**
   * 删除模型
   */
  deleteModel(modelId: string): boolean {
    // 如果正在使用该模型，先停止
    if (this.currentModel === modelId && this.isRunning) {
      this.stopServer()
    }
    return this.downloader.deleteModel(modelId, this.getModelsDir())
  }

  /**
   * 获取 llama.cpp 可执行文件路径
   */
  private getExecutablePath(backend: 'cpu' | 'cuda' | 'metal'): string {
    const platform = process.platform

    if (platform === 'win32') {
      if (backend === 'cuda') {
        // CUDA 版本
        const cudaPath = this.getResourcePath('llama-server-cuda.exe')
        if (existsSync(cudaPath)) return cudaPath
      }
      // CPU 版本
      return this.getResourcePath('llama-server.exe')
    }

    // macOS / Linux（单一 binary）
    return this.getResourcePath('llama-server')
  }

  /**
   * 获取资源路径
   */
  private getResourcePath(exeName: string): string {
    // 生产环境
    const resourcePath = join(process.resourcesPath, 'llama', exeName)
    if (existsSync(resourcePath)) {
      return resourcePath
    }

    // 开发环境
    const devPath = join(__dirname, '../../../../resources/llama', exeName)
    if (existsSync(devPath)) {
      return devPath
    }

    // 假设在 PATH 中
    return exeName
  }

  /**
   * 启动 llama-server
   */
  async startServer(
    modelId: string,
    options: {
      port?: number
      threads?: number
      gpuLayers?: number
      backend?: 'cpu' | 'cuda' | 'metal'
    } = {}
  ): Promise<number> {
    const port = options.port || 8765
    const backend = options.backend || this.hardwareInfo?.recommendedBackend || 'cpu'

    // 如果已经是同一个模型在运行，直接返回
    if (this.isRunning && this.currentModel === modelId && this.currentPort === port) {
      return port
    }

    // 停止现有服务
    await this.stopServer()

    const modelPath = this.getModelPath(modelId)
    if (!existsSync(modelPath)) {
      throw new Error('模型文件不存在，请先下载模型')
    }

    const llamaExe = this.getExecutablePath(backend)
    const threads = options.threads || 4
    const gpuLayers = options.gpuLayers !== undefined ? options.gpuLayers : (backend === 'cpu' ? 0 : 35)

    const args = [
      '-m', modelPath,
      '--port', String(port),
      '--host', '127.0.0.1',
      '-c', '4096',
      '-t', String(threads),
    ]

    // GPU 层数（0 = CPU only）
    if (gpuLayers > 0) {
      args.push('-ngl', String(gpuLayers))
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`[LocalLLM] 启动服务: ${llamaExe}`, args.join(' '))

        this.process = spawn(llamaExe, args, {
          stdio: ['ignore', 'pipe', 'pipe']
        })

        this.process.on('error', (error) => {
          console.error('[LocalLLM] 启动失败:', error)
          this.isRunning = false
          reject(error)
        })

        this.process.on('exit', (code) => {
          console.log(`[LocalLLM] 进程退出，代码: ${code}`)
          this.isRunning = false
          this.currentPort = 0
          this.currentModel = ''
        })

        // 等待服务就绪
        this.waitForReady(port, 15000)
          .then(() => {
            this.isRunning = true
            this.currentPort = port
            this.currentModel = modelId
            this.currentBackend = backend
            console.log(`[LocalLLM] 服务已启动，端口: ${port}, 后端: ${backend}`)
            resolve(port)
          })
          .catch(reject)

      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 等待服务就绪
   */
  private async waitForReady(port: number, timeout: number): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        const response = await axios.get(`http://127.0.0.1:${port}/health`, {
          timeout: 1000
        })
        if (response.status === 200) {
          return
        }
      } catch {
        // 继续等待
      }
      await new Promise(r => setTimeout(r, 500))
    }

    throw new Error('服务启动超时')
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
      this.currentModel = ''
      console.log('[LocalLLM] 服务已停止')
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): LLMStatus {
    return {
      isRunning: this.isRunning,
      port: this.currentPort,
      model: this.currentModel,
      backend: this.currentBackend
    }
  }

  /**
   * 设置配置
   */
  setConfig(config: LocalLLMConfig): void {
    this.config = config
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

**Step 2: 提交**

```bash
git add src/main/modules/local-llm/index.ts
git commit -m "feat(local-llm): 完善 LocalLLMModule，整合硬件检测和下载器"
```

---

## Task 6: 更新 Preload 脚本

**Files:**
- Modify: `src/main/preload.ts`

**Step 1: 添加本地 LLM 相关类型导入**

在文件顶部的导入中添加 `LLMHardwareInfo` 和 `LLMDownloadProgress`：

```typescript
import { IpcChannels, UserSettings, HistoryItem, FloatPosition, HardwareInfo, LocalModelInfo, LocalModelType, ModelDownloadState, DiskSpaceInfo, ModelsMigrateState, AIProviderConfig, LocalLLMModel, LLMHardwareInfo, LLMDownloadProgress } from '@shared/types'
```

**Step 2: 在 BeautifulInputAPI 接口中添加新方法**

在接口的本地 LLM 部分添加：

```typescript
  // 本地 LLM
  getLocalLLMModels: () => Promise<LocalLLMModel[]>
  getLocalLLMStatus: () => Promise<{ isRunning: boolean; port: number; model: string; backend: string }>
  detectLLMHardware: () => Promise<LLMHardwareInfo>
  downloadLocalLLMModel: (modelId: string) => Promise<string>
  cancelLLMDownload: (modelId: string) => void
  deleteLocalLLMModel: (modelId: string) => Promise<boolean>
  startLocalLLM: (modelId: string, options?: { port?: number; threads?: number; gpuLayers?: number }) => Promise<number>
  stopLocalLLM: () => Promise<void>
  onLLMDownloadProgress: (callback: (event: unknown, data: LLMDownloadProgress) => void) => void
```

**Step 3: 在 api 对象中添加实现**

在 api 对象的本地 LLM 部分添加：

```typescript
  // 本地 LLM
  getLocalLLMModels: () => ipcRenderer.invoke(IpcChannels.GET_LOCAL_LLM_MODELS),
  getLocalLLMStatus: () => ipcRenderer.invoke(IpcChannels.GET_LOCAL_LLM_STATUS),
  detectLLMHardware: () => ipcRenderer.invoke(IpcChannels.DETECT_LLM_HARDWARE),
  downloadLocalLLMModel: (modelId) => ipcRenderer.invoke(IpcChannels.DOWNLOAD_LOCAL_LLM_MODEL, modelId),
  cancelLLMDownload: (modelId) => ipcRenderer.send(IpcChannels.CANCEL_LLM_DOWNLOAD, modelId),
  deleteLocalLLMModel: (modelId) => ipcRenderer.invoke(IpcChannels.DELETE_LOCAL_LLM_MODEL, modelId),
  startLocalLLM: (modelId, options) => ipcRenderer.invoke(IpcChannels.START_LOCAL_LLM, modelId, options),
  stopLocalLLM: () => ipcRenderer.invoke(IpcChannels.STOP_LOCAL_LLM),
  onLLMDownloadProgress: (callback) => {
    ipcRenderer.on(IpcChannels.LLM_DOWNLOAD_PROGRESS, callback)
  },
```

**Step 4: 提交**

```bash
git add src/main/preload.ts
git commit -m "feat(preload): 添加本地 LLM IPC API"
```

---

## Task 7: 更新主进程 IPC 处理

**Files:**
- Modify: `src/main/index.ts`

**Step 1: 导入新类型**

在类型导入部分添加：

```typescript
import { IpcChannels, UserSettings, LocalModelType, RecordingErrorType, RecordingErrorInfo, AIProviderConfig, LLMHardwareInfo, LLMDownloadProgress } from '@shared/types/index.js'
```

**Step 2: 更新 LocalLLMModule 导入**

确保 LocalLLMModule 导入正确：

```typescript
import { localLLMModule } from './modules/local-llm/index.js'
```

**Step 3: 添加 IPC 处理器**

在 `registerIpcHandlers` 函数的本地 LLM 部分添加：

```typescript
  // 本地 LLM 相关（更新）
  ipcMain.handle(IpcChannels.GET_LOCAL_LLM_MODELS, () => {
    return localLLMModule.getBuiltinModels()
  })

  ipcMain.handle(IpcChannels.GET_LOCAL_LLM_STATUS, () => {
    return localLLMModule.getStatus()
  })

  ipcMain.handle(IpcChannels.DETECT_LLM_HARDWARE, async () => {
    return localLLMModule.detectHardware()
  })

  ipcMain.handle(IpcChannels.DOWNLOAD_LOCAL_LLM_MODEL, async (_, modelId: string) => {
    return localLLMModule.downloadModel(modelId)
  })

  ipcMain.on(IpcChannels.CANCEL_LLM_DOWNLOAD, (_, modelId: string) => {
    localLLMModule.cancelDownload(modelId)
  })

  ipcMain.handle(IpcChannels.DELETE_LOCAL_LLM_MODEL, async (_, modelId: string) => {
    return localLLMModule.deleteModel(modelId)
  })

  ipcMain.handle(IpcChannels.START_LOCAL_LLM, async (_, modelId: string, options?: { port?: number; threads?: number; gpuLayers?: number }) => {
    return localLLMModule.startServer(modelId, options)
  })

  ipcMain.handle(IpcChannels.STOP_LOCAL_LLM, async () => {
    await localLLMModule.stopServer()
  })
```

**Step 4: 添加下载进度转发**

在应用初始化部分，添加下载进度监听：

```typescript
  // 监听 LLM 下载进度，转发到渲染进程
  localLLMModule.on('download-progress', (data: LLMDownloadProgress) => {
    floatWindow?.webContents.send(IpcChannels.LLM_DOWNLOAD_PROGRESS, data)
    settingsWindow?.webContents.send(IpcChannels.LLM_DOWNLOAD_PROGRESS, data)
  })
```

**Step 5: 提交**

```bash
git add src/main/index.ts
git commit -m "feat(main): 添加本地 LLM IPC 处理器"
```

---

## Task 8: 更新设置界面 - 本地 LLM 部分

**Files:**
- Modify: `src/renderer/components/Settings.tsx`

**Step 1: 添加状态变量**

在 Settings 组件中添加本地 LLM 相关状态：

```typescript
// 在状态变量部分添加
const [llmModels, setLLMModels] = useState<LocalLLMModel[]>([])
const [llmHardware, setLLMHardware] = useState<LLMHardwareInfo | null>(null)
const [llmStatus, setLLMStatus] = useState<{ isRunning: boolean; port: number; model: string; backend: string }>({ isRunning: false, port: 0, model: '', backend: 'cpu' })
const [llmDownloading, setLLMDownloading] = useState<string | null>(null)
const [llmDownloadProgress, setLLMDownloadProgress] = useState(0)
```

**Step 2: 添加加载函数**

```typescript
// 加载本地 LLM 数据
const loadLLMData = async () => {
  try {
    const [models, hardware, status] = await Promise.all([
      window.electronAPI.getLocalLLMModels(),
      window.electronAPI.detectLLMHardware(),
      window.electronAPI.getLocalLLMStatus()
    ])
    setLLMModels(models)
    setLLMHardware(hardware)
    setLLMStatus(status)
  } catch (error) {
    console.error('加载本地 LLM 数据失败:', error)
  }
}

// 下载模型
const handleDownloadLLMModel = async (modelId: string) => {
  if (llmDownloading) return

  setLLMDownloading(modelId)
  setLLMDownloadProgress(0)

  try {
    await window.electronAPI.downloadLocalLLMModel(modelId)
    await loadLLMData()
  } catch (error) {
    showMessage('error', `下载失败: ${(error as Error).message}`)
  } finally {
    setLLMDownloading(null)
    setLLMDownloadProgress(0)
  }
}

// 删除模型
const handleDeleteLLMModel = async (modelId: string) => {
  if (!window.confirm('确定要删除此模型吗？')) return

  try {
    await window.electronAPI.deleteLocalLLMModel(modelId)
    await loadLLMData()
    showMessage('success', '模型已删除')
  } catch (error) {
    showMessage('error', '删除失败')
  }
}

// 检测硬件
const handleDetectLLMHardware = async () => {
  try {
    const hardware = await window.electronAPI.detectLLMHardware()
    setLLMHardware(hardware)
    showMessage('success', `检测完成: ${hardware.recommendedBackend} 后端`)
  } catch (error) {
    showMessage('error', '硬件检测失败')
  }
}
```

**Step 3: 在 useEffect 中初始化**

```typescript
// 在 useEffect 中添加
useEffect(() => {
  // ... 现有初始化代码

  // 加载本地 LLM 数据
  loadLLMData()

  // 监听下载进度
  window.electronAPI.onLLMDownloadProgress((_, data) => {
    if (data.status === 'downloading') {
      setLLMDownloadProgress(data.progress)
    } else if (data.status === 'completed') {
      setLLMDownloading(null)
      setLLMDownloadProgress(0)
      loadLLMData()
    } else if (data.status === 'error') {
      setLLMDownloading(null)
      showMessage('error', data.error || '下载失败')
    }
  })

  // ... cleanup
}, [])
```

**Step 4: 替换本地 LLM UI 部分**

找到设置中的本地 LLM 部分并替换为：

```tsx
{/* 本地 LLM 配置 */}
{settings.aiProvider === 'local' && (
  <div className="local-llm-section">
    <h4>硬件检测</h4>

    {llmHardware ? (
      <div className="hardware-info">
        <p>
          <strong>检测结果：</strong>
          {llmHardware.hasNvidia ? `${llmHardware.nvidiaGpuName} (${llmHardware.vram}MB)` :
           llmHardware.isAppleSilicon ? 'Apple Silicon' : 'CPU'}
        </p>
        <p>
          <strong>推荐后端：</strong> {llmHardware.recommendedBackend.toUpperCase()}
        </p>
        <p>
          <strong>推荐模型：</strong> {llmModels.find(m => m.id === llmHardware.recommendedModel)?.name || llmHardware.recommendedModel}
        </p>
        <button className="btn btn-secondary" onClick={handleDetectLLMHardware}>
          重新检测
        </button>
      </div>
    ) : (
      <p>正在检测硬件...</p>
    )}

    <h4 style={{ marginTop: '16px' }}>可用模型</h4>
    <div className="model-list">
      {llmModels.map(model => (
        <div key={model.id} className="model-item">
          <div className="model-info">
            <span className="model-name">
              {model.name}
              {model.recommended && <span className="badge">推荐</span>}
              {model.gpuRecommended && <span className="badge warning">建议 GPU</span>}
            </span>
            <span className="model-meta">
              {model.size} | {model.ramRequired} 内存
            </span>
            {model.description && (
              <span className="model-desc">{model.description}</span>
            )}
          </div>
          <div className="model-actions">
            {model.downloaded ? (
              <>
                <span className="status downloaded">✓ 已下载</span>
                <button
                  className="btn btn-small btn-danger"
                  onClick={() => handleDeleteLLMModel(model.id)}
                  disabled={llmStatus.model === model.id && llmStatus.isRunning}
                >
                  删除
                </button>
              </>
            ) : llmDownloading === model.id ? (
              <div className="download-progress">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${llmDownloadProgress}%` }} />
                </div>
                <span>{llmDownloadProgress}%</span>
                <button
                  className="btn btn-small"
                  onClick={() => window.electronAPI.cancelLLMDownload(model.id)}
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                className="btn btn-small"
                onClick={() => handleDownloadLLMModel(model.id)}
                disabled={!!llmDownloading}
              >
                下载
              </button>
            )}
          </div>
        </div>
      ))}
    </div>

    <h4 style={{ marginTop: '16px' }}>服务状态</h4>
    <div className="service-status">
      {llmStatus.isRunning ? (
        <p className="running">
          运行中 - 端口: {llmStatus.port}, 模型: {llmModels.find(m => m.id === llmStatus.model)?.name}
        </p>
      ) : (
        <p className="stopped">服务未运行</p>
      )}
    </div>

    <p className="help-text" style={{ marginTop: '12px' }}>
      本地 LLM 功能允许在完全离线的情况下使用 AI 文本处理。
      选择"本地 LLM"作为 AI 服务提供商后，系统会自动启动本地推理服务。
    </p>
  </div>
)}
```

**Step 5: 提交**

```bash
git add src/renderer/components/Settings.tsx
git commit -m "feat(settings): 完善本地 LLM 设置界面"
```

---

## Task 9: 添加 CSS 样式

**Files:**
- Modify: `src/renderer/Settings.css`

**Step 1: 添加本地 LLM 样式**

在文件末尾添加：

```css
/* 本地 LLM 设置 */
.local-llm-section {
  margin-top: 16px;
}

.local-llm-section h4 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  color: #1a1a1a;
}

.local-llm-section .hardware-info {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.local-llm-section .hardware-info p {
  margin: 4px 0;
  font-size: 13px;
}

.local-llm-section .model-list {
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  overflow: hidden;
}

.local-llm-section .model-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #e5e5e5;
}

.local-llm-section .model-item:last-child {
  border-bottom: none;
}

.local-llm-section .model-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.local-llm-section .model-name {
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 8px;
}

.local-llm-section .badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #6366F1;
  color: white;
}

.local-llm-section .badge.warning {
  background: #F59E0B;
}

.local-llm-section .model-meta {
  font-size: 12px;
  color: #666;
}

.local-llm-section .model-desc {
  font-size: 12px;
  color: #888;
}

.local-llm-section .model-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.local-llm-section .status.downloaded {
  color: #10B981;
  font-size: 13px;
}

.local-llm-section .download-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.local-llm-section .progress-bar {
  width: 80px;
  height: 6px;
  background: #e5e5e5;
  border-radius: 3px;
  overflow: hidden;
}

.local-llm-section .progress-fill {
  height: 100%;
  background: #6366F1;
  transition: width 0.3s;
}

.local-llm-section .service-status {
  background: #f5f5f5;
  border-radius: 8px;
  padding: 12px;
}

.local-llm-section .service-status .running {
  color: #10B981;
}

.local-llm-section .service-status .stopped {
  color: #6B7280;
}
```

**Step 2: 提交**

```bash
git add src/renderer/Settings.css
git commit -m "style: 添加本地 LLM 设置样式"
```

---

## Task 10: 打包配置

**Files:**
- Modify: `electron.vite.config.ts` 或 `electron-builder.yml`（根据项目配置文件）

**Step 1: 检查当前打包配置**

```bash
cd "E:\下载\Kimi_Agent_语音输入工具设计\typeless"
cat electron-builder.yml 2>/dev/null || cat package.json | grep -A 50 build
```

**Step 2: 添加 llama 资源**

在 electron-builder 配置中添加：

```yaml
# electron-builder.yml
extraResources:
  - from: "resources/llama"
    to: "llama"
    filter:
      - "**/*"
```

或在 package.json 的 build 配置中：

```json
{
  "build": {
    "extraResources": [
      {
        "from": "resources/llama",
        "to": "llama",
        "filter": ["**/*"]
      }
    ]
  }
}
```

**Step 3: 创建资源目录结构**

```bash
mkdir -p "E:\下载\Kimi_Agent_语音输入工具设计\typeless\resources\llama"
```

**Step 4: 提交**

```bash
git add electron-builder.yml package.json resources/llama/.gitkeep 2>/dev/null
git commit -m "build: 配置 llama.cpp 资源打包"
```

---

## Task 11: 测试和修复

**Step 1: 运行类型检查**

```bash
cd "E:\下载\Kimi_Agent_语音输入工具设计\typeless"
npm run typecheck
```

Expected: 无新增类型错误

**Step 2: 运行开发服务器**

```bash
npm run dev
```

Expected: 应用正常启动

**Step 3: 测试功能清单**

- [ ] 硬件检测显示正确
- [ ] 模型列表正确显示
- [ ] 下载模型功能正常
- [ ] 删除模型功能正常
- [ ] 服务启动/停止正常
- [ ] AI 文本处理正常

**Step 4: 提交修复**

```bash
git add -A
git commit -m "fix: 修复测试中发现的问题"
```

---

## Task 12: 完成

**Step 1: 最终提交**

```bash
git add -A
git commit -m "feat: 完成本地 LLM 功能实现

- 添加硬件检测（CPU/CUDA/Metal）
- 实现模型下载器（支持镜像）
- 完善进程管理和服务启动
- 更新设置界面
- 配置打包资源"
```

**Step 2: 更新 README**

在 README 中更新功能说明。

---

## 执行顺序总结

| Task | 描述 | 依赖 |
|------|------|------|
| 1 | 更新类型定义 | - |
| 2 | 更新模型配置 | 1 |
| 3 | 创建硬件检测器 | 1 |
| 4 | 创建模型下载器 | 1 |
| 5 | 更新 LocalLLMModule | 2,3,4 |
| 6 | 更新 Preload | 1 |
| 7 | 更新主进程 IPC | 5,6 |
| 8 | 更新设置界面 | 6,7 |
| 9 | 添加 CSS 样式 | 8 |
| 10 | 打包配置 | - |
| 11 | 测试和修复 | 1-10 |
| 12 | 完成 | 11 |
