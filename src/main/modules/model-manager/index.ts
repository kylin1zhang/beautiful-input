import { app } from 'electron'
import { createWriteStream, existsSync, statSync, unlinkSync, readdirSync } from 'fs'
import { mkdir, readFile, writeFile, copyFile } from 'fs/promises'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import { exec } from 'child_process'
import { promisify } from 'util'
import axios from 'axios'
import {
  LocalModelInfo,
  LocalModelType,
  ModelDownloadState
} from '@shared/types/index.js'
import {
  LOCAL_WHISPER_MODELS,
  LOCAL_WHISPER_MIRROR_URLS,
  WHISPER_EXECUTABLES
} from '@shared/constants/index.js'

const execAsync = promisify(exec)

export class ModelManager extends EventEmitter {
  private modelsDir: string
  private whisperDir: string
  private downloadAbortControllers: Map<LocalModelType, AbortController> = new Map()
  private whisperDownloadController: AbortController | null = null

  constructor() {
    super()
    // 模型存储在用户数据目录下
    this.modelsDir = join(app.getPath('userData'), 'whisper-models')
    this.whisperDir = join(app.getPath('userData'), 'whisper-bin')
    this.ensureModelsDir()
  }

  /**
   * 确保模型目录存在
   */
  private async ensureModelsDir(): Promise<void> {
    if (!existsSync(this.modelsDir)) {
      await mkdir(this.modelsDir, { recursive: true })
    }
    if (!existsSync(this.whisperDir)) {
      await mkdir(this.whisperDir, { recursive: true })
    }
  }

  /**
   * 获取模型文件路径
   */
  private getModelPath(modelType: LocalModelType): string {
    return join(this.modelsDir, `ggml-${modelType}.bin`)
  }

  /**
   * 检查 Whisper 可执行文件是否存在
   */
  isWhisperInstalled(): boolean {
    const platform = process.platform as 'win32' | 'darwin' | 'linux'
    const exeNames = platform === 'win32'
      ? ['whisper-cli.exe', 'main.exe']
      : ['whisper-cli', 'main']

    // zip 解压后可能在根目录或 Release 子目录
    for (const exeName of exeNames) {
      const possiblePaths = [
        join(this.whisperDir, exeName),
        join(this.whisperDir, 'Release', exeName)
      ]

      for (const path of possiblePaths) {
        if (existsSync(path)) {
          return true
        }
      }
    }

    return false
  }

  /**
   * 从项目资源目录安装 Whisper
   * 开发者需要把 whisper-bin-x64.zip 放在 resources/whisper/ 目录下
   */
  async installWhisperFromResources(): Promise<boolean> {
    // 如果已安装，跳过
    if (this.isWhisperInstalled()) {
      console.log('[ModelManager] Whisper 已安装')
      return true
    }

    const platform = process.platform as 'win32' | 'darwin' | 'linux'

    // 资源文件路径（开发和生产环境）
    // 开发环境：dist/main/ -> ../../resources/whisper/
    // 生产环境：process.resourcesPath/whisper/
    const devResourcePath = join(__dirname, '../../resources/whisper/whisper-bin-x64.zip')
    const prodResourcePath = join(process.resourcesPath, 'whisper/whisper-bin-x64.zip')

    let zipPath: string | null = null

    if (existsSync(devResourcePath)) {
      zipPath = devResourcePath
    } else if (existsSync(prodResourcePath)) {
      zipPath = prodResourcePath
    }

    if (!zipPath) {
      console.error('[ModelManager] 未找到 Whisper 资源文件')
      console.log('请将 whisper-bin-x64.zip 放在 resources/whisper/ 目录下')
      return false
    }

    console.log('[ModelManager] 从资源目录安装 Whisper:', zipPath)

    try {
      // 复制 zip 到临时目录
      const tempZip = join(this.whisperDir, 'whisper.zip')
      await copyFile(zipPath, tempZip)

      // 解压
      if (platform === 'win32') {
        await execAsync(`powershell -command "Expand-Archive -Path '${tempZip}' -DestinationPath '${this.whisperDir}' -Force"`)
      } else {
        await execAsync(`unzip -o "${tempZip}" -d "${this.whisperDir}"`)
      }

      // 删除 zip
      unlinkSync(tempZip)

      // 设置可执行权限
      if (platform !== 'win32') {
        const mainExe = join(this.whisperDir, 'main')
        if (existsSync(mainExe)) {
          await execAsync(`chmod +x "${mainExe}"`)
        }
      }

      console.log('[ModelManager] Whisper 安装成功')
      return true
    } catch (error) {
      console.error('[ModelManager] Whisper 安装失败:', error)
      return false
    }
  }

  /**
   * 确保 Whisper 已安装（从资源目录自动安装）
   */
  async ensureWhisperInstalled(): Promise<boolean> {
    if (this.isWhisperInstalled()) {
      return true
    }
    return this.installWhisperFromResources()
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
        let startTime = Date.now()

        // 创建写入流
        const writer = createWriteStream(modelPath)

        await new Promise<void>((resolve, reject) => {
          response.data.on('data', (chunk: Buffer) => {
            downloadedSize += chunk.length

            // 每 200ms 更新一次进度
            const now = Date.now()
            if (now - lastProgressTime > 200) {
              const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0
              const elapsedMs = now - startTime
              const speed = this.formatSpeed(downloadedSize, elapsedMs)

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
