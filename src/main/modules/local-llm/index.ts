// src/main/modules/local-llm/index.ts

import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import axios from 'axios'
import { LocalLLMModel, LocalLLMConfig, LLMHardwareInfo, LLMDownloadProgress } from '@shared/types/index.js'
import { LOCAL_LLM_MODELS } from './model-configs.js'
import { llmHardwareDetector } from './hardware-detector.js'
import { llmModelDownloader } from './downloader.js'

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
  private customBasePath: string | null = null  // 自定义基础路径

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
    if (this.customBasePath) {
      // 使用自定义路径，LLM 模型存放在 llm-models 子目录
      return join(this.customBasePath, 'llm-models')
    }
    // 默认路径：userData/models/llm
    const userDataPath = app.getPath('userData')
    return join(userDataPath, 'models', 'llm')
  }

  /**
   * 设置自定义基础路径（与 Whisper 共享同一个基础路径）
   */
  setCustomBasePath(path: string | null): void {
    this.customBasePath = path
  }

  /**
   * 获取当前使用的基础路径
   */
  getBasePath(): { current: string; isCustom: boolean; default: string } {
    const defaultPath = join(app.getPath('userData'), 'models')
    return {
      current: this.customBasePath || defaultPath,
      isCustom: this.customBasePath !== null,
      default: defaultPath
    }
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
    // 生产环境 - llama 子目录
    const resourcePath = join(process.resourcesPath, 'llama', exeName)
    if (existsSync(resourcePath)) {
      return resourcePath
    }

    // 生产环境 - resources 根目录（兼容）
    const resourcePathRoot = join(process.resourcesPath, exeName)
    if (existsSync(resourcePathRoot)) {
      return resourcePathRoot
    }

    // 开发环境 - llama 子目录
    const devPath = join(__dirname, '../../../../resources/llama', exeName)
    if (existsSync(devPath)) {
      return devPath
    }

    // 开发环境 - resources 根目录（兼容）
    const devPathRoot = join(__dirname, '../../../../resources', exeName)
    if (existsSync(devPathRoot)) {
      return devPathRoot
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
    console.log(`[LocalLLM] 可执行文件路径: ${llamaExe}`)
    console.log(`[LocalLLM] 文件存在: ${existsSync(llamaExe)}`)

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
