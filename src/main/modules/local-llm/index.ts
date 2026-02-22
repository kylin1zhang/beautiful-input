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
  private currentModel: string = ''

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

    const llamaExe = this.getLlamaExePath()

    return new Promise((resolve, reject) => {
      try {
        console.log(`[LocalLLM] 启动服务: ${llamaExe} -m ${modelPath} --port ${port}`)

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

        this.process.on('exit', (code) => {
          console.log(`[LocalLLM] 进程退出，代码: ${code}`)
          this.isRunning = false
          this.currentPort = 0
          this.currentModel = ''
        })

        // 等待服务启动
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.isRunning = true
            this.currentPort = port
            this.currentModel = modelId
            console.log(`[LocalLLM] 服务已启动，端口: ${port}`)
            resolve(port)
          } else {
            reject(new Error('服务启动超时'))
          }
        }, 3000)

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
      this.currentModel = ''
      console.log('[LocalLLM] 服务已停止')
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): { isRunning: boolean; port: number; model: string } {
    return {
      isRunning: this.isRunning,
      port: this.currentPort,
      model: this.currentModel
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
