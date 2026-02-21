# 本地语音识别功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 BeautifulInput 添加本地语音识别功能，支持用户在本地运行 Whisper.cpp 模型，避免网络延迟并支持离线使用。

**Architecture:** 新增 3 个主进程模块（hardware-detector、model-manager、local-transcriber），修改现有 transcription 模块支持引擎选择，在设置界面添加本地模型配置页面。

**Tech Stack:** TypeScript, Electron, Whisper.cpp, axios (下载), crypto (SHA256)

---

## Task 1: 定义类型和常量

**Files:**
- Modify: `src/shared/types/index.ts` (新增类型定义)
- Modify: `src/shared/constants/index.ts` (新增常量)

**Step 1: 添加本地模型相关类型定义**

在 `src/shared/types/index.ts` 文件末尾添加：

```typescript
// 本地语音识别模型类型
export type LocalModelType = 'base' | 'small' | 'medium' | 'large-v3'

// 本地模型信息
export interface LocalModelInfo {
  type: LocalModelType
  name: string
  size: number  // 字节
  sizeDisplay: string  // 显示用，如 "142MB"
  downloaded: boolean
  downloading: boolean
  downloadProgress?: number  // 0-100
  sha256: string  // 用于校验
  url: string  // 下载地址
}

// 硬件检测结果
export interface HardwareInfo {
  platform: 'win32' | 'darwin' | 'linux'
  hasNvidia: boolean
  nvidiaGpuName?: string
  vram?: number  // MB
  isAppleSilicon: boolean
  totalMemory: number  // GB
  recommendedModel: LocalModelType
  recommendedReason: string
}

// 本地模型配置
export interface LocalModelSettings {
  enabled: boolean  // 是否启用本地模型
  selectedModel: LocalModelType
  language: string  // 'auto' | 'zh' | 'en' | ...
  threads: number  // CPU 线程数
  useGpu: boolean  // 是否使用 GPU
}

// 模型下载状态
export interface ModelDownloadState {
  modelType: LocalModelType
  status: 'idle' | 'downloading' | 'completed' | 'error'
  progress: number  // 0-100
  speed?: string  // 如 "2.5 MB/s"
  error?: string
}
```

**Step 2: 在 UserSettings 中添加本地模型配置**

在 `UserSettings` 接口中添加：

```typescript
// 在 UserSettings 接口中添加（约第 56 行附近）
export interface UserSettings {
  // ... 现有字段 ...

  // 本地模型配置
  localModel: LocalModelSettings

  // 硬件检测结果缓存
  hardwareInfo?: HardwareInfo
}
```

**Step 3: 更新 defaultSettings**

在 `defaultSettings` 中添加默认值：

```typescript
export const defaultSettings: UserSettings = {
  // ... 现有字段 ...

  localModel: {
    enabled: false,
    selectedModel: 'base',
    language: 'auto',
    threads: 4,
    useGpu: true
  },
  hardwareInfo: undefined
}
```

**Step 4: 修改 asrProvider 类型**

修改 `asrProvider` 字段以支持本地模型：

```typescript
// 将原来的
asrProvider: 'groq' | 'openai'
// 改为
asrProvider: 'groq' | 'openai' | 'local'
```

**Step 5: 添加 IPC 通道**

在 `IpcChannels` 枚举中添加：

```typescript
export enum IpcChannels {
  // ... 现有通道 ...

  // 本地模型相关
  DETECT_HARDWARE = 'detect-hardware',
  GET_HARDWARE_INFO = 'get-hardware-info',
  GET_LOCAL_MODELS = 'get-local-models',
  DOWNLOAD_MODEL = 'download-model',
  DELETE_MODEL = 'delete-model',
  CANCEL_DOWNLOAD = 'cancel-download',
  TEST_LOCAL_TRANSCRIPTION = 'test-local-transcription',
  MODEL_DOWNLOAD_PROGRESS = 'model-download-progress'
}
```

**Step 6: 添加本地模型常量**

在 `src/shared/constants/index.ts` 中添加：

```typescript
// 本地 Whisper 模型配置
export const LOCAL_WHISPER_MODELS: Record<string, {
  name: string
  size: number
  sha256: string
  url: string
}> = {
  'base': {
    name: 'Base',
    size: 142 * 1024 * 1024,  // 142MB
    sha256: '',  // TODO: 填入实际 SHA256
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
  },
  'small': {
    name: 'Small',
    size: 466 * 1024 * 1024,  // 466MB
    sha256: '',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
  },
  'medium': {
    name: 'Medium',
    size: 1500 * 1024 * 1024,  // 1.5GB
    sha256: '',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin'
  },
  'large-v3': {
    name: 'Large V3',
    size: 2900 * 1024 * 1024,  // 2.9GB
    sha256: '',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
  }
}

// 国内镜像下载地址
export const LOCAL_WHISPER_MIRROR_URLS: Record<string, string[]> = {
  'base': [
    'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-base.bin'
  ],
  'small': [
    'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small.bin'
  ],
  'medium': [
    'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin'
  ],
  'large-v3': [
    'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
  ]
}

// Whisper.cpp 可执行文件配置
export const WHISPER_EXECUTABLES = {
  win32: {
    cuda: 'whisper-cuda.exe',
    cpu: 'whisper.exe'
  },
  darwin: {
    metal: 'whisper-metal',
    cpu: 'whisper'
  },
  linux: {
    cuda: 'whisper-cuda',
    cpu: 'whisper'
  }
}
```

**Step 7: 提交代码**

```bash
git add src/shared/types/index.ts src/shared/constants/index.ts
git commit -m "feat(local-whisper): 添加本地语音识别类型定义和常量"
```

---

## Task 2: 实现硬件检测模块

**Files:**
- Create: `src/main/modules/hardware-detector/index.ts`

**Step 1: 创建硬件检测模块**

创建文件 `src/main/modules/hardware-detector/index.ts`：

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'
import { platform, totalmem } from 'os'
import { HardwareInfo, LocalModelType } from '@shared/types/index.js'

const execAsync = promisify(exec)

export class HardwareDetector {
  /**
   * 检测硬件信息
   */
  async detect(): Promise<HardwareInfo> {
    const currentPlatform = platform() as 'win32' | 'darwin' | 'linux'

    const result: HardwareInfo = {
      platform: currentPlatform,
      hasNvidia: false,
      isAppleSilicon: false,
      totalMemory: Math.round(totalmem() / (1024 * 1024 * 1024)),
      recommendedModel: 'base',
      recommendedReason: ''
    }

    // 检测 NVIDIA GPU
    if (currentPlatform === 'win32' || currentPlatform === 'linux') {
      const nvidiaInfo = await this.detectNvidia()
      result.hasNvidia = nvidiaInfo.hasNvidia
      result.nvidiaGpuName = nvidiaInfo.name
      result.vram = nvidiaInfo.vram
    }

    // 检测 Apple Silicon
    if (currentPlatform === 'darwin') {
      result.isAppleSilicon = await this.detectAppleSilicon()
    }

    // 推荐模型
    const recommendation = this.recommendModel(result)
    result.recommendedModel = recommendation.model
    result.recommendedReason = recommendation.reason

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
      // Windows 使用 nvidia-smi
      if (platform() === 'win32') {
        const { stdout } = await execAsync(
          'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
          { timeout: 5000 }
        )
        const lines = stdout.trim().split('\n')
        if (lines.length > 0) {
          const [name, vram] = lines[0].split(',').map(s => s.trim())
          return {
            hasNvidia: true,
            name,
            vram: parseInt(vram, 10)
          }
        }
      }

      // Linux 使用 nvidia-smi
      if (platform() === 'linux') {
        const { stdout } = await execAsync(
          'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null',
          { timeout: 5000 }
        )
        if (stdout.trim()) {
          const [name, vram] = stdout.trim().split(',').map(s => s.trim())
          return {
            hasNvidia: true,
            name,
            vram: parseInt(vram, 10)
          }
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
      return stdout.includes('Apple') || stdout.includes('M1') || stdout.includes('M2') || stdout.includes('M3')
    } catch {
      // 无法检测，假设不是 Apple Silicon
      return false
    }
  }

  /**
   * 根据硬件推荐模型
   */
  private recommendModel(hw: HardwareInfo): {
    model: LocalModelType
    reason: string
  } {
    // NVIDIA GPU 8GB+ 显存 -> large-v3
    if (hw.hasNvidia && hw.vram && hw.vram >= 8000) {
      return {
        model: 'large-v3',
        reason: '检测到高性能 NVIDIA GPU，推荐使用最高精度模型'
      }
    }

    // NVIDIA GPU 4-8GB 显存 -> medium
    if (hw.hasNvidia && hw.vram && hw.vram >= 4000) {
      return {
        model: 'medium',
        reason: '检测到 NVIDIA GPU，推荐使用中等模型'
      }
    }

    // Apple Silicon -> medium
    if (hw.isAppleSilicon) {
      return {
        model: 'medium',
        reason: '检测到 Apple Silicon 芯片，推荐使用中等模型'
      }
    }

    // CPU + 16GB+ 内存 -> small
    if (hw.totalMemory >= 16) {
      return {
        model: 'small',
        reason: '内存充足，推荐使用 small 模型'
      }
    }

    // CPU + 8-16GB 内存 -> base
    return {
      model: 'base',
      reason: '推荐使用 base 模型，速度和准确率兼顾'
    }
  }
}
```

**Step 2: 提交代码**

```bash
git add src/main/modules/hardware-detector/index.ts
git commit -m "feat(local-whisper): 实现硬件检测模块"
```

---

## Task 3: 实现模型管理模块

**Files:**
- Create: `src/main/modules/model-manager/index.ts`

**Step 1: 创建模型管理模块**

创建文件 `src/main/modules/model-manager/index.ts`：

```typescript
import { app } from 'electron'
import { createWriteStream, existsSync, statSync, unlinkSync } from 'fs'
import { mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import axios from 'axios'
import {
  LocalModelInfo,
  LocalModelType,
  ModelDownloadState
} from '@shared/types/index.js'
import {
  LOCAL_WHISPER_MODELS,
  LOCAL_WHISPER_MIRROR_URLS
} from '@shared/constants/index.js'

export class ModelManager extends EventEmitter {
  private modelsDir: string
  private downloadAbortControllers: Map<LocalModelType, AbortController> = new Map()

  constructor() {
    super()
    // 模型存储在用户数据目录下
    this.modelsDir = join(app.getPath('userData'), 'whisper-models')
    this.ensureModelsDir()
  }

  /**
   * 确保模型目录存在
   */
  private async ensureModelsDir(): Promise<void> {
    if (!existsSync(this.modelsDir)) {
      await mkdir(this.modelsDir, { recursive: true })
    }
  }

  /**
   * 获取模型文件路径
   */
  private getModelPath(modelType: LocalModelType): string {
    return join(this.modelsDir, `ggml-${modelType}.bin`)
  }

  /**
   * 获取所有可用模型信息
   */
  async getModels(): Promise<LocalModelInfo[]> {
    const models: LocalModelInfo[] = []

    for (const [type, config] of Object.entries(LOCAL_WHISPER_MODELS)) {
      const modelPath = this.getModelPath(type as LocalModelType)
      const downloaded = existsSync(modelPath)

      let sizeDisplay = '0MB'
      if (config.size > 1024 * 1024 * 1024) {
        sizeDisplay = `${(config.size / (1024 * 1024 * 1024)).toFixed(1)}GB`
      } else {
        sizeDisplay = `${Math.round(config.size / (1024 * 1024))}MB`
      }

      models.push({
        type: type as LocalModelType,
        name: config.name,
        size: config.size,
        sizeDisplay,
        downloaded,
        downloading: false,
        sha256: config.sha256,
        url: config.url
      })
    }

    return models
  }

  /**
   * 检查模型是否已下载
   */
  isModelDownloaded(modelType: LocalModelType): boolean {
    return existsSync(this.getModelPath(modelType))
  }

  /**
   * 下载模型
   */
  async downloadModel(modelType: LocalModelType): Promise<boolean> {
    const config = LOCAL_WHISPER_MODELS[modelType]
    if (!config) {
      throw new Error(`未知的模型类型: ${modelType}`)
    }

    const modelPath = this.getModelPath(modelType)

    // 如果已存在，跳过
    if (existsSync(modelPath)) {
      this.emit('download-complete', { modelType })
      return true
    }

    // 创建 AbortController
    const abortController = new AbortController()
    this.downloadAbortControllers.set(modelType, abortController)

    // 获取下载地址列表（优先使用镜像）
    const urls = [
      ...(LOCAL_WHISPER_MIRROR_URLS[modelType] || []),
      config.url
    ]

    let lastError: Error | null = null

    for (const url of urls) {
      try {
        // 发送开始下载事件
        this.emit('download-start', { modelType, url })

        const response = await axios({
          method: 'GET',
          url,
          responseType: 'stream',
          signal: abortController.signal,
          timeout: 30000,
          headers: {
            'User-Agent': 'BeautifulInput/1.0'
          }
        })

        const totalSize = parseInt(response.headers['content-length'] || '0', 10)
        let downloadedSize = 0
        let lastProgressTime = Date.now()

        // 创建写入流
        const writer = createWriteStream(modelPath)

        await new Promise<void>((resolve, reject) => {
          response.data.on('data', (chunk: Buffer) => {
            downloadedSize += chunk.length

            // 每 200ms 更新一次进度
            const now = Date.now()
            if (now - lastProgressTime > 200) {
              const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0
              const speed = this.formatSpeed(downloadedSize, 0) // 简化处理

              this.emit('download-progress', {
                modelType,
                progress,
                downloadedSize,
                totalSize,
                speed
              })
              lastProgressTime = now
            }
          })

          response.data.pipe(writer)

          writer.on('finish', resolve)
          writer.on('error', reject)
        })

        // 下载完成
        this.downloadAbortControllers.delete(modelType)
        this.emit('download-complete', { modelType })

        return true
      } catch (error) {
        lastError = error as Error

        // 如果是主动取消，直接抛出
        if (axios.isCancel(error)) {
          this.downloadAbortControllers.delete(modelType)
          this.emit('download-cancelled', { modelType })
          return false
        }

        // 尝试下一个地址
        console.warn(`[ModelManager] 下载失败 (${url}):`, error)
        continue
      }
    }

    // 所有地址都失败
    this.downloadAbortControllers.delete(modelType)
    this.emit('download-error', {
      modelType,
      error: lastError?.message || '下载失败'
    })
    throw lastError || new Error('下载失败')
  }

  /**
   * 取消下载
   */
  cancelDownload(modelType: LocalModelType): void {
    const controller = this.downloadAbortControllers.get(modelType)
    if (controller) {
      controller.abort()
      this.downloadAbortControllers.delete(modelType)
    }
  }

  /**
   * 删除模型
   */
  async deleteModel(modelType: LocalModelType): Promise<boolean> {
    const modelPath = this.getModelPath(modelType)

    if (existsSync(modelPath)) {
      try {
        unlinkSync(modelPath)
        this.emit('model-deleted', { modelType })
        return true
      } catch (error) {
        console.error('[ModelManager] 删除模型失败:', error)
        return false
      }
    }

    return true
  }

  /**
   * 校验模型文件完整性
   */
  async verifyModel(modelType: LocalModelType): Promise<boolean> {
    const config = LOCAL_WHISPER_MODELS[modelType]
    if (!config || !config.sha256) {
      // 没有配置校验值，跳过校验
      return true
    }

    const modelPath = this.getModelPath(modelType)
    if (!existsSync(modelPath)) {
      return false
    }

    try {
      const fileBuffer = await readFile(modelPath)
      const hash = createHash('sha256').update(fileBuffer).digest('hex')
      return hash === config.sha256
    } catch {
      return false
    }
  }

  /**
   * 格式化下载速度
   */
  private formatSpeed(downloaded: number, elapsedMs: number): string {
    if (elapsedMs === 0) return '0 B/s'

    const bytesPerSecond = downloaded / (elapsedMs / 1000)
    if (bytesPerSecond > 1024 * 1024) {
      return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
    } else if (bytesPerSecond > 1024) {
      return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
    }
    return `${Math.round(bytesPerSecond)} B/s`
  }

  /**
   * 销毁模块
   */
  destroy(): void {
    // 取消所有下载
    for (const [modelType] of this.downloadAbortControllers) {
      this.cancelDownload(modelType)
    }
    this.removeAllListeners()
  }
}
```

**Step 2: 提交代码**

```bash
git add src/main/modules/model-manager/index.ts
git commit -m "feat(local-whisper): 实现模型管理模块"
```

---

## Task 4: 实现本地转录模块

**Files:**
- Create: `src/main/modules/local-transcriber/index.ts`

**Step 1: 创建本地转录模块**

创建文件 `src/main/modules/local-transcriber/index.ts`：

```typescript
import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import {
  TranscriptionResult,
  LocalModelType,
  HardwareInfo
} from '@shared/types/index.js'
import { WHISPER_EXECUTABLES } from '@shared/constants/index.js'
import { bufferToWav } from '@shared/utils/index.js'

export class LocalTranscriber extends EventEmitter {
  private whisperProcess: ChildProcess | null = null
  private modelsDir: string

  constructor() {
    super()
    this.modelsDir = join(app.getPath('userData'), 'whisper-models')
  }

  /**
   * 获取 Whisper 可执行文件路径
   */
  private getWhisperExecutable(hw: HardwareInfo): string {
    const platform = hw.platform
    const useGpu = hw.hasNvidia || hw.isAppleSilicon

    let executableName: string

    if (platform === 'win32') {
      executableName = useGpu && hw.hasNvidia
        ? WHISPER_EXECUTABLES.win32.cuda
        : WHISPER_EXECUTABLES.win32.cpu
    } else if (platform === 'darwin') {
      executableName = hw.isAppleSilicon
        ? WHISPER_EXECUTABLES.darwin.metal
        : WHISPER_EXECUTABLES.darwin.cpu
    } else {
      executableName = useGpu && hw.hasNvidia
        ? WHISPER_EXECUTABLES.linux.cuda
        : WHISPER_EXECUTABLES.linux.cpu
    }

    // 开发环境：从 resources 目录读取
    // 生产环境：从 app.asar.unpacked 或 resources 目录读取
    const devPath = join(__dirname, '../../../../resources/whisper', executableName)
    const prodPath = join(process.resourcesPath, 'whisper', executableName)

    if (process.env.NODE_ENV === 'development' && existsSync(devPath)) {
      return devPath
    }

    return prodPath
  }

  /**
   * 获取模型路径
   */
  private getModelPath(modelType: LocalModelType): string {
    return join(this.modelsDir, `ggml-${modelType}.bin`)
  }

  /**
   * 转录音频
   */
  async transcribe(
    audioBuffer: Buffer,
    modelType: LocalModelType,
    hw: HardwareInfo,
    language: string = 'auto',
    threads: number = 4
  ): Promise<TranscriptionResult> {
    // 转换为 WAV 格式
    const wavBuffer = bufferToWav(audioBuffer, 16000, 1)

    // 获取可执行文件路径
    const whisperPath = this.getWhisperExecutable(hw)
    const modelPath = this.getModelPath(modelType)

    // 检查文件是否存在
    if (!existsSync(whisperPath)) {
      return {
        success: false,
        error: 'Whisper 可执行文件不存在，请重新安装应用'
      }
    }

    if (!existsSync(modelPath)) {
      return {
        success: false,
        error: '模型文件不存在，请先下载模型'
      }
    }

    // 构建命令参数
    const args = [
      '-m', modelPath,
      '-f', '-',  // 从 stdin 读取
      '-nt',  // 不打印时间戳
      '--output-txt',  // 输出文本
      '-t', threads.toString()
    ]

    // GPU 加速
    if (hw.hasNvidia) {
      args.push('--gpu')
    } else if (hw.isAppleSilicon) {
      // Apple Silicon 使用 Metal 加速
      // whisper-metal 自动使用 GPU，无需额外参数
    }

    // 语言设置
    if (language && language !== 'auto') {
      args.push('-l', language)
    }

    return new Promise((resolve) => {
      try {
        this.whisperProcess = spawn(whisperPath, args, {
          stdio: ['pipe', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''

        this.whisperProcess.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString()
        })

        this.whisperProcess.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString()
        })

        this.whisperProcess.on('close', (code) => {
          this.whisperProcess = null

          if (code !== 0) {
            resolve({
              success: false,
              error: `Whisper 进程异常退出 (code ${code}): ${stderr}`
            })
            return
          }

          // 解析输出
          const text = this.parseWhisperOutput(stdout)

          if (!text) {
            resolve({
              success: false,
              error: '无法识别语音内容'
            })
            return
          }

          resolve({
            success: true,
            text,
            confidence: 1.0
          })
        })

        this.whisperProcess.on('error', (error) => {
          this.whisperProcess = null
          resolve({
            success: false,
            error: `Whisper 进程启动失败: ${error.message}`
          })
        })

        // 写入音频数据到 stdin
        this.whisperProcess.stdin?.write(wavBuffer)
        this.whisperProcess.stdin?.end()

      } catch (error) {
        resolve({
          success: false,
          error: `转录失败: ${(error as Error).message}`
        })
      }
    })
  }

  /**
   * 解析 Whisper 输出
   */
  private parseWhisperOutput(output: string): string {
    // Whisper.cpp 输出格式：
    // [00:00:00.000 --> 00:00:05.000]   识别的文本内容
    // 或纯文本输出

    const lines = output.split('\n')
    const textParts: string[] = []

    for (const line of lines) {
      // 跳过空行和元信息
      if (!line.trim()) continue
      if (line.startsWith('whisper') || line.startsWith('system')) continue

      // 提取文本（移除时间戳）
      const match = line.match(/\[[\d:.]+ --> [\d:.]+\]\s*(.+)/)
      if (match) {
        textParts.push(match[1].trim())
      } else if (!line.includes('[') && !line.includes('processing')) {
        // 纯文本行
        textParts.push(line.trim())
      }
    }

    return textParts.join(' ').trim()
  }

  /**
   * 取消转录
   */
  cancel(): void {
    if (this.whisperProcess) {
      this.whisperProcess.kill()
      this.whisperProcess = null
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
```

**Step 2: 提交代码**

```bash
git add src/main/modules/local-transcriber/index.ts
git commit -m "feat(local-whisper): 实现本地转录模块"
```

---

## Task 5: 集成模块到主进程

**Files:**
- Modify: `src/main/index.ts`

**Step 1: 导入新模块**

在 `src/main/index.ts` 顶部导入区域添加：

```typescript
// 在现有导入后添加
import { HardwareDetector } from './modules/hardware-detector/index.js'
import { ModelManager } from './modules/model-manager/index.js'
import { LocalTranscriber } from './modules/local-transcriber/index.js'
```

**Step 2: 添加模块实例变量**

在现有模块变量后添加：

```typescript
// 模块实例（约第 30 行附近）
let hardwareDetector: HardwareDetector
let modelManager: ModelManager
let localTranscriber: LocalTranscriber
```

**Step 3: 初始化模块**

在 `app.whenReady()` 中初始化模块：

```typescript
// 在现有模块初始化后添加
hardwareDetector = new HardwareDetector()
modelManager = new ModelManager()
localTranscriber = new LocalTranscriber()

// 监听模型下载进度，转发到渲染进程
modelManager.on('download-progress', (data) => {
  floatWindow?.webContents.send(IpcChannels.MODEL_DOWNLOAD_PROGRESS, data)
})
modelManager.on('download-complete', (data) => {
  floatWindow?.webContents.send(IpcChannels.MODEL_DOWNLOAD_PROGRESS, {
    ...data,
    status: 'completed'
  })
})
modelManager.on('download-error', (data) => {
  floatWindow?.webContents.send(IpcChannels.MODEL_DOWNLOAD_PROGRESS, {
    ...data,
    status: 'error'
  })
})
```

**Step 4: 添加 IPC 处理器**

在 `registerIpcHandlers()` 函数中添加：

```typescript
// 硬件检测
ipcMain.handle(IpcChannels.DETECT_HARDWARE, async () => {
  const info = await hardwareDetector.detect()
  // 缓存到设置中
  settingsModule.setSettings({ hardwareInfo: info })
  return info
})

ipcMain.handle(IpcChannels.GET_HARDWARE_INFO, () => {
  return settingsModule.getSettings().hardwareInfo
})

// 模型管理
ipcMain.handle(IpcChannels.GET_LOCAL_MODELS, async () => {
  return modelManager.getModels()
})

ipcMain.handle(IpcChannels.DOWNLOAD_MODEL, async (_, modelType: LocalModelType) => {
  return modelManager.downloadModel(modelType)
})

ipcMain.handle(IpcChannels.CANCEL_DOWNLOAD, (_, modelType: LocalModelType) => {
  modelManager.cancelDownload(modelType)
  return true
})

ipcMain.handle(IpcChannels.DELETE_MODEL, async (_, modelType: LocalModelType) => {
  return modelManager.deleteModel(modelType)
})

// 测试本地转录
ipcMain.handle(IpcChannels.TEST_LOCAL_TRANSCRIPTION, async () => {
  // TODO: 使用测试音频进行转录测试
  return { success: true, message: '测试成功' }
})
```

**Step 5: 修改 stopRecording 支持本地模型**

在 `stopRecording()` 函数中修改语音识别部分：

```typescript
// 替换原来的语音识别逻辑
const settings = settingsModule.getSettings()

let transcriptionResult: TranscriptionResult

if (settings.asrProvider === 'local' && settings.localModel?.enabled) {
  // 使用本地模型
  if (!settings.hardwareInfo) {
    settings.hardwareInfo = await hardwareDetector.detect()
  }

  transcriptionResult = await localTranscriber.transcribe(
    audioBuffer,
    settings.localModel.selectedModel,
    settings.hardwareInfo,
    settings.localModel.language,
    settings.localModel.threads
  )
} else {
  // 使用 API
  const asrApiKey = settings.asrProvider === 'openai'
    ? settings.openaiApiKey
    : settings.groqApiKey

  transcriptionResult = await transcriptionModule.transcribe(
    audioBuffer,
    asrApiKey,
    settings.asrProvider === 'local' ? 'groq' : settings.asrProvider,
    settings.personalDictionary
  )
}
```

**Step 6: 同样修改 stopTranslateRecording**

在 `stopTranslateRecording()` 函数中应用相同的本地模型逻辑。

**Step 7: 提交代码**

```bash
git add src/main/index.ts
git commit -m "feat(local-whisper): 集成本地语音识别模块到主进程"
```

---

## Task 6: 更新 preload 脚本

**Files:**
- Modify: `src/main/preload.ts`

**Step 1: 添加本地模型相关 API**

在 `BeautifulInputAPI` 接口中添加：

```typescript
interface BeautifulInputAPI {
  // ... 现有 API ...

  // 本地模型相关
  detectHardware: () => Promise<HardwareInfo>
  getHardwareInfo: () => Promise<HardwareInfo | undefined>
  getLocalModels: () => Promise<LocalModelInfo[]>
  downloadModel: (modelType: LocalModelType) => Promise<boolean>
  cancelDownload: (modelType: LocalModelType) => Promise<boolean>
  deleteModel: (modelType: LocalModelType) => Promise<boolean>
  testLocalTranscription: () => Promise<{ success: boolean; message: string }>
  onModelDownloadProgress: (callback: (event: unknown, data: ModelDownloadState) => void) => void
}
```

**Step 2: 实现 API**

在 `api` 对象中添加：

```typescript
const api: BeautifulInputAPI = {
  // ... 现有实现 ...

  // 本地模型相关
  detectHardware: () => ipcRenderer.invoke(IpcChannels.DETECT_HARDWARE),
  getHardwareInfo: () => ipcRenderer.invoke(IpcChannels.GET_HARDWARE_INFO),
  getLocalModels: () => ipcRenderer.invoke(IpcChannels.GET_LOCAL_MODELS),
  downloadModel: (modelType) => ipcRenderer.invoke(IpcChannels.DOWNLOAD_MODEL, modelType),
  cancelDownload: (modelType) => ipcRenderer.invoke(IpcChannels.CANCEL_DOWNLOAD, modelType),
  deleteModel: (modelType) => ipcRenderer.invoke(IpcChannels.DELETE_MODEL, modelType),
  testLocalTranscription: () => ipcRenderer.invoke(IpcChannels.TEST_LOCAL_TRANSCRIPTION),
  onModelDownloadProgress: (callback) => {
    ipcRenderer.on(IpcChannels.MODEL_DOWNLOAD_PROGRESS, callback)
  }
}
```

**Step 3: 提交代码**

```bash
git add src/main/preload.ts
git commit -m "feat(local-whisper): 更新 preload 脚本添加本地模型 API"
```

---

## Task 7: 更新设置界面

**Files:**
- Modify: `src/renderer/components/Settings.tsx`
- Modify: `src/renderer/Settings.css`

**Step 1: 添加本地模型设置状态**

在 `Settings` 组件中添加状态：

```typescript
// 在现有状态后添加
const [localModels, setLocalModels] = useState<LocalModelInfo[]>([])
const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null)
const [downloadingModel, setDownloadingModel] = useState<LocalModelType | null>(null)
const [downloadProgress, setDownloadProgress] = useState(0)
```

**Step 2: 添加加载函数**

```typescript
// 加载本地模型信息
const loadLocalModels = async () => {
  try {
    const models = await window.electronAPI.getLocalModels()
    setLocalModels(models)
  } catch (error) {
    console.error('加载模型信息失败:', error)
  }
}

// 加载硬件信息
const loadHardwareInfo = async () => {
  try {
    const info = await window.electronAPI.getHardwareInfo()
    if (info) {
      setHardwareInfo(info)
    }
  } catch (error) {
    console.error('加载硬件信息失败:', error)
  }
}

// 检测硬件
const detectHardware = async () => {
  showMessage('success', '正在检测硬件...')
  try {
    const info = await window.electronAPI.detectHardware()
    setHardwareInfo(info)
    showMessage('success', '硬件检测完成')
  } catch (error) {
    showMessage('error', '硬件检测失败')
  }
}

// 下载模型
const handleDownloadModel = async (modelType: LocalModelType) => {
  setDownloadingModel(modelType)
  setDownloadProgress(0)

  try {
    await window.electronAPI.downloadModel(modelType)
    // 下载完成后刷新模型列表
    await loadLocalModels()
    showMessage('success', '模型下载完成')
  } catch (error) {
    showMessage('error', `下载失败: ${(error as Error).message}`)
  } finally {
    setDownloadingModel(null)
    setDownloadProgress(0)
  }
}

// 删除模型
const handleDeleteModel = async (modelType: LocalModelType) => {
  if (!window.confirm('确定要删除此模型吗？')) return

  try {
    await window.electronAPI.deleteModel(modelType)
    await loadLocalModels()
    showMessage('success', '模型已删除')
  } catch (error) {
    showMessage('error', '删除失败')
  }
}
```

**Step 3: 添加 useEffect**

```typescript
// 在组件加载时获取模型和硬件信息
useEffect(() => {
  loadLocalModels()
  loadHardwareInfo()

  // 监听下载进度
  window.electronAPI.onModelDownloadProgress((_, data) => {
    if (data.status === 'downloading') {
      setDownloadProgress(data.progress || 0)
    }
  })
}, [])
```

**Step 4: 更新语音服务提供商选择**

修改 `asrProvider` 选择器：

```tsx
<div className="form-group">
  <label>
    <Key className="label-icon" />
    语音服务提供商
  </label>
  <select
    value={settings.asrProvider}
    onChange={e => updateSetting('asrProvider', e.target.value as 'groq' | 'openai' | 'local')}
  >
    <option value="groq">Groq (Whisper Large V3)</option>
    <option value="openai">OpenAI (Whisper)</option>
    <option value="local">本地模型 (离线)</option>
  </select>
  <span className="help-text">
    选择用于语音识别的服务提供商
  </span>
</div>
```

**Step 5: 添加本地模型配置 UI**

在 API 配置区域添加本地模型配置：

```tsx
{/* 本地模型配置 */}
{settings.asrProvider === 'local' && (
  <div className="local-model-section">
    <h4>本地模型设置</h4>

    {/* 硬件检测 */}
    <div className="form-group">
      <label>硬件检测</label>
      <div className="hardware-info">
        {hardwareInfo ? (
          <>
            <p>
              <strong>检测结果：</strong>
              {hardwareInfo.hasNvidia && hardwareInfo.nvidiaGpuName
                ? `${hardwareInfo.nvidiaGpuName} (${hardwareInfo.vram}MB)`
                : hardwareInfo.isAppleSilicon
                  ? 'Apple Silicon'
                  : '仅 CPU'}
            </p>
            <p>
              <strong>推荐模型：</strong>
              {hardwareInfo.recommendedModel}
              <span className="recommend-reason">({hardwareInfo.recommendedReason})</span>
            </p>
          </>
        ) : (
          <p>尚未检测硬件</p>
        )}
        <button className="btn btn-secondary" onClick={detectHardware}>
          重新检测
        </button>
      </div>
    </div>

    {/* 模型列表 */}
    <div className="form-group">
      <label>模型选择</label>
      <div className="model-list">
        {localModels.map(model => (
          <div key={model.type} className="model-item">
            <label className="model-radio">
              <input
                type="radio"
                name="localModel"
                value={model.type}
                checked={settings.localModel?.selectedModel === model.type}
                onChange={() => updateSetting('localModel', {
                  ...settings.localModel,
                  selectedModel: model.type
                })}
                disabled={!model.downloaded}
              />
              <span className="model-name">{model.name}</span>
              <span className="model-size">{model.sizeDisplay}</span>
              {model.downloaded && <span className="model-status downloaded">✓ 已下载</span>}
            </label>
            <div className="model-actions">
              {!model.downloaded && (
                <>
                  {downloadingModel === model.type ? (
                    <div className="download-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${downloadProgress}%` }}
                        />
                      </div>
                      <span>{downloadProgress}%</span>
                    </div>
                  ) : (
                    <button
                      className="btn btn-small"
                      onClick={() => handleDownloadModel(model.type)}
                    >
                      下载
                    </button>
                  )}
                </>
              )}
              {model.downloaded && (
                <button
                  className="btn btn-small btn-danger"
                  onClick={() => handleDeleteModel(model.type)}
                >
                  删除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* 高级选项 */}
    <div className="form-group">
      <label>语言</label>
      <select
        value={settings.localModel?.language || 'auto'}
        onChange={e => updateSetting('localModel', {
          ...settings.localModel,
          language: e.target.value
        })}
      >
        <option value="auto">自动检测</option>
        <option value="zh">中文</option>
        <option value="en">英语</option>
        <option value="ja">日语</option>
        <option value="ko">韩语</option>
      </select>
    </div>
  </div>
)}
```

**Step 6: 添加 CSS 样式**

在 `Settings.css` 中添加：

```css
/* 本地模型配置样式 */
.local-model-section {
  margin-top: 20px;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
}

.local-model-section h4 {
  margin: 0 0 15px 0;
  color: #333;
}

.hardware-info {
  padding: 10px;
  background: white;
  border-radius: 6px;
  margin-bottom: 10px;
}

.hardware-info p {
  margin: 5px 0;
}

.recommend-reason {
  color: #666;
  font-size: 12px;
  margin-left: 8px;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.model-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
}

.model-radio {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.model-name {
  font-weight: 500;
}

.model-size {
  color: #666;
  font-size: 13px;
}

.model-status.downloaded {
  color: #10b981;
  font-size: 12px;
}

.model-actions {
  display: flex;
  gap: 8px;
}

.download-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-bar {
  width: 100px;
  height: 6px;
  background: #e0e0e0;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  transition: width 0.2s;
}
```

**Step 7: 提交代码**

```bash
git add src/renderer/components/Settings.tsx src/renderer/Settings.css
git commit -m "feat(local-whisper): 更新设置界面添加本地模型配置"
```

---

## Task 8: 准备 Whisper.cpp 可执行文件

**Files:**
- Create: `resources/whisper/` 目录结构

**Step 1: 创建目录结构**

```bash
mkdir -p resources/whisper
```

**Step 2: 下载 Whisper.cpp 可执行文件**

需要从 Whisper.cpp 官方 Release 下载以下文件：

- Windows CUDA 版本: `whisper-cuda.exe`
- Windows CPU 版本: `whisper.exe`
- macOS Metal 版本: `whisper-metal`
- macOS CPU 版本: `whisper`
- Linux CUDA 版本: `whisper-cuda`
- Linux CPU 版本: `whisper`

**Step 3: 更新 electron-builder 配置**

在 `electron-builder.yml` 或 `package.json` 的 build 配置中添加：

```yaml
extraResources:
  - from: "resources/whisper"
    to: "whisper"
    filter:
      - "**/*"
```

**Step 4: 提交**

```bash
git add resources/ electron-builder.yml
git commit -m "feat(local-whisper): 添加 Whisper.cpp 可执行文件配置"
```

---

## Task 9: 测试和文档

**Files:**
- Update: `README.md`

**Step 1: 更新 README 文档**

添加本地语音识别功能说明：

```markdown
## 本地语音识别

BeautifulInput 支持本地运行 Whisper 模型进行语音识别，无需联网即可使用。

### 特点

- 完全离线运行，无需 API Key
- 支持多种模型（base/small/medium/large-v3）
- 自动检测硬件并推荐合适的模型
- 支持 NVIDIA GPU 和 Apple Silicon 加速

### 使用方法

1. 打开设置，选择「语音服务提供商」为「本地模型」
2. 点击「检测硬件」获取推荐模型
3. 下载推荐的模型文件
4. 开始使用！

### 模型说明

| 模型 | 大小 | 准确率 | 推荐配置 |
|-----|-----|-------|---------|
| base | 142MB | 一般 | CPU + 8GB 内存 |
| small | 466MB | 较好 | CPU + 16GB 内存 |
| medium | 1.5GB | 好 | GPU 4GB+ 或 Apple Silicon |
| large-v3 | 2.9GB | 最好 | NVIDIA GPU 8GB+ |
```

**Step 2: 提交**

```bash
git add README.md
git commit -m "docs: 更新 README 添加本地语音识别说明"
```

---

## 执行摘要

| Task | 描述 | 文件数 |
|------|------|--------|
| 1 | 定义类型和常量 | 2 |
| 2 | 实现硬件检测模块 | 1 |
| 3 | 实现模型管理模块 | 1 |
| 4 | 实现本地转录模块 | 1 |
| 5 | 集成到主进程 | 1 |
| 6 | 更新 preload 脚本 | 1 |
| 7 | 更新设置界面 | 2 |
| 8 | 准备可执行文件 | 目录 |
| 9 | 测试和文档 | 1 |

**总计**: 修改 10+ 文件，新增 3 个模块
