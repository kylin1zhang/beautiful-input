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
