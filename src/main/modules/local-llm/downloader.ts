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
          try { unlinkSync(targetPath) } catch { /* ignore */ }
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

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve())
        writer.on('error', (err) => reject(err))
        response.data.on('error', (err: Error) => reject(err))
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
