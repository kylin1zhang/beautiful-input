import { EventEmitter } from 'events'
import { ASRRouter, createProvider } from './router.js'
import { ASRProviderConfig, ASRCallbacks, AudioChunk } from './types.js'
import { StreamingASRProvider, StreamingASRResult, StreamingASRStatus, StreamingASRError, StreamingASRConfig } from '@shared/types'
import type { TermManager } from '../term-manager/index.js'

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
    const callbacks: ASRCallbacks = {
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
export { FunASRProvider } from './providers/funasr.js'
export type { ASRProviderConfig, ASRCallbacks, AudioChunk } from './types.js'
