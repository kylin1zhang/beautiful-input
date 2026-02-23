import { StreamingASRProvider, StreamingASRResult, StreamingASRStatus, StreamingASRError } from '@shared/types'

/**
 * 提供商配置接口
 */
export interface ASRProviderConfig {
  provider: StreamingASRProvider
  // 云端配置
  aliyun?: {
    accessKeyId?: string
    accessKeySecret?: string
    appKey?: string
  }
  zhipu?: {
    apiKey?: string
  }
  xunfei?: {
    appId?: string
    apiKey?: string
    apiSecret?: string
  }
  groq?: {
    apiKey?: string
  }
  // 本地配置
  funasr?: {
    modelPath?: string
  }
}

/**
 * 流式 ASR 回调接口
 */
export interface ASRCallbacks {
  onResult: (result: StreamingASRResult) => void
  onStatusChange: (status: StreamingASRStatus) => void
  onError: (error: StreamingASRError) => void
}

/**
 * 音频块信息
 */
export interface AudioChunk {
  data: Buffer
  timestamp: number
}
