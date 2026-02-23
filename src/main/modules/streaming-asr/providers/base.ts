import { EventEmitter } from 'events'
import { ASRProviderConfig, ASRCallbacks, AudioChunk } from '../types.js'
import { StreamingASRProvider, StreamingASRResult, StreamingASRStatus, StreamingASRError } from '@shared/types'

/**
 * 流式 ASR 提供商基类
 * 所有提供商适配器都继承此类
 */
export abstract class BaseASRProvider extends EventEmitter {
  protected config: ASRProviderConfig
  protected callbacks: ASRCallbacks
  protected status: StreamingASRStatus = 'idle'
  protected providerName: StreamingASRProvider

  constructor(config: ASRProviderConfig, callbacks: ASRCallbacks) {
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
