import { app, dialog } from 'electron'
import { createWriteStream, existsSync, statSync, unlinkSync, readdirSync } from 'fs'
import { mkdir, readFile, writeFile, copyFile, cp, rm } from 'fs/promises'
import { join, dirname } from 'path'
import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import { exec } from 'child_process'
import { promisify } from 'util'
import axios from 'axios'
import {
  LocalModelInfo,
  LocalModelType,
  ModelDownloadState,
  DiskSpaceInfo,
  ModelsMigrateState
} from '@shared/types/index.js'
import {
  LOCAL_WHISPER_MODELS,
  LOCAL_WHISPER_MIRROR_URLS,
  WHISPER_EXECUTABLES
} from '@shared/constants/index.js'

const execAsync = promisify(exec)

export class ModelManager extends EventEmitter {
  private customModelsPath: string | null = null
  private downloadAbortControllers: Map<LocalModelType, AbortController> = new Map()
  private whisperDownloadController: AbortController | null = null
  private migrateAbortController: AbortController | null = null

  /**
   * 获取默认模型存储路径
   */
  getDefaultModelsPath(): string {
    return join(app.getPath('userData'), 'whisper-models')
  }

  /**
   * 获取默认存储父目录
   */
  getDefaultParentPath(): string {
    return app.getPath('userData')
  }

  /**
   * 获取默认 Whisper 程序路径
   */
  private getDefaultWhisperPath(): string {
    return join(app.getPath('userData'), 'whisper-bin')
  }

  /**
   * 获取当前模型存储路径
   */
  getModelsPath(): string {
    if (this.customModelsPath) {
      // 自定义路径下，模型存放在 whisper-models 子目录
      return join(this.customModelsPath, 'whisper-models')
    }
    return this.getDefaultModelsPath()
  }

  /**
   * 获取当前 Whisper 程序路径
   */
  getWhisperPath(): string {
    if (this.customModelsPath) {
      // 自定义路径下，Whisper 存放在 whisper-bin 子目录
      return join(this.customModelsPath, 'whisper-bin')
    }
    return this.getDefaultWhisperPath()
  }

  /**
   * 设置自定义模型路径
   */
  setCustomPath(path: string | null): void {
    this.customModelsPath = path
  }

  /**
   * 获取当前路径配置
   */
  getPathConfig(): { current: string; isCustom: boolean; default: string; defaultParent: string } {
    return {
      current: this.getModelsPath(),
      isCustom: this.customModelsPath !== null,
      default: this.getDefaultModelsPath(),
      defaultParent: this.getDefaultParentPath()
    }
  }

  /**
   * 获取磁盘空间信息
   */
  getDiskSpaceInfo(path?: string): DiskSpaceInfo {
    const targetPath = path || this.getModelsPath()
    try {
      const stats = statSync(targetPath)
      // 使用 child_process 调用系统命令获取磁盘信息
      // Windows: wmic logicaldisk get size,freespace,caption
      // 对于简单实现，返回模拟数据（实际使用时需要调用系统 API）
      return {
        total: 0,
        free: 0,
        used: 0
      }
    } catch {
      // 路径不存在，返回父目录信息
      const parentDir = dirname(targetPath)
      if (existsSync(parentDir)) {
        return this.getDiskSpaceInfo(parentDir)
      }
      return { total: 0, free: 0, used: 0 }
    }
  }

  /**
   * 确保模型目录存在
   */
  async ensureModelsDir(): Promise<void> {
    const modelsDir = this.getModelsPath()
    const whisperDir = this.getWhisperPath()

    if (!existsSync(modelsDir)) {
      await mkdir(modelsDir, { recursive: true })
    }
    if (!existsSync(whisperDir)) {
      await mkdir(whisperDir, { recursive: true })
    }
  }

  /**
   * 获取模型文件路径
   */
  private getModelPath(modelType: LocalModelType): string {
    return join(this.getModelsPath(), `ggml-${modelType}.bin`)
  }

  /**
   * 检查 Whisper 可执行文件是否存在
   */
  isWhisperInstalled(): boolean {
    const platform = process.platform as 'win32' | 'darwin' | 'linux'
    const exeNames = platform === 'win32'
      ? ['whisper-cli.exe', 'main.exe']
      : ['whisper-cli', 'main']

    const whisperDir = this.getWhisperPath()

    // zip 解压后可能在根目录或 Release 子目录
    for (const exeName of exeNames) {
      const possiblePaths = [
        join(whisperDir, exeName),
        join(whisperDir, 'Release', exeName)
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
    const whisperDir = this.getWhisperPath()

    console.log('[ModelManager] 准备安装 Whisper 到:', whisperDir)
    console.log('[ModelManager] 当前 customModelsPath:', this.customModelsPath)

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
      // 确保目标目录存在
      if (!existsSync(whisperDir)) {
        console.log('[ModelManager] 创建目录:', whisperDir)
        await mkdir(whisperDir, { recursive: true })
      }

      // 复制 zip 到临时目录
      const tempZip = join(whisperDir, 'whisper.zip')
      console.log('[ModelManager] 复制 zip 到:', tempZip)
      await copyFile(zipPath, tempZip)
      console.log('[ModelManager] zip 文件大小:', statSync(tempZip).size)

      // 解压
      if (platform === 'win32') {
        console.log('[ModelManager] 开始解压...')
        const { stdout, stderr } = await execAsync(`powershell -command "Expand-Archive -Path '${tempZip}' -DestinationPath '${whisperDir}' -Force"`)
        if (stdout) console.log('[ModelManager] 解压输出:', stdout)
        if (stderr) console.log('[ModelManager] 解压错误:', stderr)
      } else {
        await execAsync(`unzip -o "${tempZip}" -d "${whisperDir}"`)
      }

      // 检查解压后的文件
      const files = readdirSync(whisperDir, { withFileTypes: true })
      console.log('[ModelManager] 解压后目录内容:', files.map(f => f.name).join(', '))

      // 删除 zip
      unlinkSync(tempZip)

      // 设置可执行权限
      if (platform !== 'win32') {
        const mainExe = join(whisperDir, 'main')
        if (existsSync(mainExe)) {
          await execAsync(`chmod +x "${mainExe}"`)
        }
      }

      // 验证安装是否成功（检查可执行文件是否存在）
      if (!this.isWhisperInstalled()) {
        console.error('[ModelManager] Whisper 安装验证失败：可执行文件不存在')
        return false
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
    await this.ensureModelsDir()
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

    // 确保目录存在
    await this.ensureModelsDir()

    const modelPath = this.getModelPath(modelType)

    // 如果已存在，跳过
    if (existsSync(modelPath)) {
      this.emit('download-complete', { modelType })
      return true
    }

    // 检查是否有任何模型正在下载中（同时只允许下载一个模型）
    if (this.downloadAbortControllers.size > 0) {
      const downloadingModelType = this.downloadAbortControllers.keys().next().value
      console.log(`[ModelManager] 模型 ${downloadingModelType} 正在下载中，不允许同时下载多个模型`)
      throw new Error('有模型正在下载中，请等待当前下载完成后再下载其他模型')
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
        // 发送开始下载事件（重置进度为 0）
        this.emit('download-start', { modelType, url })
        this.emit('download-progress', {
          modelType,
          progress: 0,
          downloadedSize: 0,
          totalSize: 0,
          speed: '0 B/s'
        })

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
          // 监听取消信号，关闭写入流
          const onAbort = () => {
            writer.destroy()
            response.data.destroy()
            reject(new Error('Download aborted'))
          }

          abortController.signal.addEventListener('abort', onAbort)

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

          writer.on('finish', () => {
            abortController.signal.removeEventListener('abort', onAbort)
            resolve()
          })
          writer.on('error', (err) => {
            abortController.signal.removeEventListener('abort', onAbort)
            reject(err)
          })
        })

        // 下载完成
        this.downloadAbortControllers.delete(modelType)
        this.emit('download-complete', { modelType })

        return true
      } catch (error) {
        lastError = error as Error

        // 如果是主动取消，删除部分下载的文件并返回
        if (axios.isCancel(error) || (error as Error).message === 'Download aborted') {
          this.downloadAbortControllers.delete(modelType)
          // 等待一小段时间确保文件流关闭
          await new Promise(resolve => setTimeout(resolve, 100))
          // 清理部分下载的文件
          if (existsSync(modelPath)) {
            try {
              unlinkSync(modelPath)
              console.log(`[ModelManager] 已清理部分下载的文件: ${modelPath}`)
            } catch (cleanupError) {
              console.warn(`[ModelManager] 清理部分下载文件失败:`, cleanupError)
            }
          }
          this.emit('download-cancelled', { modelType })
          return false
        }

        // 尝试下一个地址前，清理部分下载的文件
        if (existsSync(modelPath)) {
          try {
            // 等待一小段时间确保文件流关闭
            await new Promise(resolve => setTimeout(resolve, 100))
            unlinkSync(modelPath)
            console.log(`[ModelManager] 已清理失败下载的临时文件: ${modelPath}`)
          } catch (cleanupError) {
            console.warn(`[ModelManager] 清理临时文件失败:`, cleanupError)
          }
        }

        // 尝试下一个地址
        console.warn(`[ModelManager] 下载失败 (${url}):`, error)
        continue
      }
    }

    // 所有地址都失败，清理部分下载的文件
    this.downloadAbortControllers.delete(modelType)
    if (existsSync(modelPath)) {
      try {
        unlinkSync(modelPath)
        console.log(`[ModelManager] 已清理部分下载的文件: ${modelPath}`)
      } catch (cleanupError) {
        console.warn(`[ModelManager] 清理部分下载文件失败:`, cleanupError)
      }
    }
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
      console.log(`[ModelManager] 已请求取消模型下载: ${modelType}`)
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
   * 获取目录大小（字节）
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    if (!existsSync(dirPath)) {
      return 0
    }

    let totalSize = 0
    const files = readdirSync(dirPath, { withFileTypes: true })

    for (const file of files) {
      const filePath = join(dirPath, file.name)
      if (file.isDirectory()) {
        totalSize += await this.getDirectorySize(filePath)
      } else {
        const stats = statSync(filePath)
        totalSize += stats.size
      }
    }

    return totalSize
  }

  /**
   * 迁移模型和 Whisper 程序到新路径
   */
  async migrateToPath(newPath: string): Promise<{ success: boolean; error?: string }> {
    const oldModelsPath = this.getModelsPath()
    const oldWhisperPath = this.getWhisperPath()
    const newModelsPath = join(newPath, 'whisper-models')
    const newWhisperPath = join(newPath, 'whisper-bin')

    console.log(`[ModelManager] 开始迁移: ${oldModelsPath} -> ${newModelsPath}`)
    console.log(`[ModelManager] Whisper: ${oldWhisperPath} -> ${newWhisperPath}`)

    // 检查是否是同一路径
    if (oldModelsPath === newModelsPath) {
      console.log('[ModelManager] 源路径和目标路径相同，跳过迁移')
      return { success: true }
    }

    // 检查新路径是否已有文件
    if (existsSync(newModelsPath) || existsSync(newWhisperPath)) {
      console.log('[ModelManager] 目标路径已存在文件')
      return { success: false, error: '目标路径已存在文件，请选择空目录' }
    }

    // 创建取消控制器
    this.migrateAbortController = new AbortController()

    try {
      this.emit('migrate-progress', {
        status: 'migrating',
        progress: 0,
        currentFile: '准备迁移...'
      } as ModelsMigrateState)

      // 计算总文件数和总大小
      let totalFiles = 0
      let copiedFiles = 0

      const countFiles = (dir: string): number => {
        if (!existsSync(dir)) return 0
        let count = 0
        const files = readdirSync(dir, { withFileTypes: true })
        for (const file of files) {
          if (file.isDirectory()) {
            count += countFiles(join(dir, file.name))
          } else {
            count++
          }
        }
        return count
      }

      totalFiles = countFiles(oldModelsPath) + countFiles(oldWhisperPath)
      console.log(`[ModelManager] 需要迁移 ${totalFiles} 个文件`)

      if (totalFiles === 0) {
        // 没有文件需要迁移，直接更新路径
        console.log('[ModelManager] 没有文件需要迁移，直接更新路径')
        this.customModelsPath = newPath
        await this.ensureModelsDir()
        // 在发送完成事件前，先尝试安装 Whisper（如果资源存在）
        console.log('[ModelManager] 尝试在新路径安装 Whisper...')
        await this.ensureWhisperInstalled()
        this.emit('migrate-progress', {
          status: 'completed',
          progress: 100
        } as ModelsMigrateState)
        return { success: true }
      }

      // 创建新目录
      await mkdir(newModelsPath, { recursive: true })
      await mkdir(newWhisperPath, { recursive: true })

      // 复制文件（使用递归复制）
      const copyDir = async (src: string, dest: string): Promise<void> => {
        if (this.migrateAbortController?.signal.aborted) {
          throw new Error('迁移已取消')
        }

        if (!existsSync(src)) return

        const files = readdirSync(src, { withFileTypes: true })
        for (const file of files) {
          const srcPath = join(src, file.name)
          const destPath = join(dest, file.name)

          if (file.isDirectory()) {
            await mkdir(destPath, { recursive: true })
            await copyDir(srcPath, destPath)
          } else {
            this.emit('migrate-progress', {
              status: 'migrating',
              progress: Math.round((copiedFiles / totalFiles) * 100),
              currentFile: file.name
            } as ModelsMigrateState)

            await copyFile(srcPath, destPath)
            copiedFiles++
          }
        }
      }

      // 复制模型文件
      await copyDir(oldModelsPath, newModelsPath)

      // 复制 Whisper 程序
      await copyDir(oldWhisperPath, newWhisperPath)

      // 验证复制成功
      const oldModels = await this.getModels()
      let allValid = true
      for (const model of oldModels) {
        if (model.downloaded) {
          const newModelPath = join(newModelsPath, `ggml-${model.type}.bin`)
          if (!existsSync(newModelPath)) {
            allValid = false
            break
          }
        }
      }

      if (!allValid) {
        // 清理新目录
        await rm(newModelsPath, { recursive: true, force: true })
        await rm(newWhisperPath, { recursive: true, force: true })
        return { success: false, error: '文件复制验证失败' }
      }

      // 删除旧文件
      this.emit('migrate-progress', {
        status: 'migrating',
        progress: 90,
        currentFile: '清理旧文件...'
      } as ModelsMigrateState)

      await rm(oldModelsPath, { recursive: true, force: true })
      await rm(oldWhisperPath, { recursive: true, force: true })

      // 更新路径
      this.customModelsPath = newPath

      // 确保新路径下已安装 Whisper（如果资源存在）
      console.log('[ModelManager] 检查新路径的 Whisper 安装状态...')
      await this.ensureWhisperInstalled()

      this.emit('migrate-progress', {
        status: 'completed',
        progress: 100
      } as ModelsMigrateState)

      console.log(`[ModelManager] 迁移完成: ${oldModelsPath} -> ${newModelsPath}`)
      return { success: true }

    } catch (error) {
      const errorMessage = (error as Error).message
      this.emit('migrate-progress', {
        status: 'error',
        progress: 0,
        error: errorMessage
      } as ModelsMigrateState)
      return { success: false, error: errorMessage }
    } finally {
      this.migrateAbortController = null
    }
  }

  /**
   * 取消迁移
   */
  cancelMigration(): void {
    if (this.migrateAbortController) {
      this.migrateAbortController.abort()
    }
  }

  /**
   * 打开文件夹选择对话框
   */
  async selectModelsPath(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: '选择模型存储位置',
      message: '请选择一个文件夹来存储 Whisper 模型',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
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
    // 取消迁移
    this.cancelMigration()
    this.removeAllListeners()
  }
}
