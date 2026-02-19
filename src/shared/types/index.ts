// 应用状态类型
export type AppStatus = 'idle' | 'recording' | 'processing' | 'error'

// 录音状态
export interface RecordingState {
  status: AppStatus
  startTime?: number
  duration: number
  audioChunks: Buffer[]
}

// 处理结果
export interface ProcessingResult {
  originalText: string
  processedText: string
  timestamp: number
  appName: string
  duration: number
}

// 用户设置
export interface UserSettings {
  // API 配置
  groqApiKey: string
  deepseekApiKey: string
  qwenApiKey: string
  aiProvider: 'deepseek' | 'qwen'  // AI 服务提供商选择

  // 快捷键设置
  shortcuts: {
    toggleRecording: string
    quickTranslate: string
    aiAssistant: string
  }

  // 个性化设置
  toneStyle: 'formal' | 'casual' | 'professional' | 'creative'
  personalDictionary: string[]
  defaultLanguage: string

  // 其他设置
  autoStart: boolean
  floatOpacity: number
  historyRetentionDays: number

  // 功能开关
  enableTranslation: boolean
  enableAiAssistant: boolean

  // AI 助手默认动作
  aiAssistantAction: 'summarize' | 'explain' | 'expand'

  // 自动停止录音配置
  autoStopRecording: {
    enabled: boolean
    vadSilenceDuration: number // 毫秒
  }
}

// 默认设置
export const defaultSettings: UserSettings = {
  groqApiKey: '',
  deepseekApiKey: '',
  qwenApiKey: '',
  aiProvider: 'deepseek',
  shortcuts: {
    toggleRecording: 'Alt+Shift+R',
    quickTranslate: 'Alt+Shift+T',
    aiAssistant: 'Alt+Shift+A'
  },
  toneStyle: 'professional',
  personalDictionary: [],
  defaultLanguage: 'zh-CN',
  autoStart: false,
  floatOpacity: 0.9,
  historyRetentionDays: 30,
  enableTranslation: false,
  enableAiAssistant: false,
  aiAssistantAction: 'summarize',
  autoStopRecording: {
    enabled: true,
    vadSilenceDuration: 5000
  }
}

// 历史记录项
export interface HistoryItem {
  id: string
  originalText: string
  processedText: string
  timestamp: number
  appName: string
  duration: number
  tags: string[]
}

// AI 处理模式
export type AiProcessingMode = 'clean' | 'format' | 'translate' | 'assistant'

// AI 处理请求
export interface AiProcessingRequest {
  text: string
  mode: AiProcessingMode
  targetLanguage?: string
  context?: string
}

// AI 处理响应
export interface AiProcessingResponse {
  success: boolean
  result?: string
  error?: string
}

// 语音识别结果
export interface TranscriptionResult {
  success: boolean
  text?: string
  error?: string
  confidence?: number
}

// 录音配置
export interface RecordingConfig {
  sampleRate: number
  channels: number
  bitDepth: number
  maxDuration: number // 最大录音时长（秒）
  minDuration: number // 最小录音时长（秒）
}

export const defaultRecordingConfig: RecordingConfig = {
  sampleRate: 16000,
  channels: 1,
  bitDepth: 16,
  maxDuration: 600, // 10分钟
  minDuration: 1    // 1秒
}

// 悬浮球位置
export interface FloatPosition {
  x: number
  y: number
}

// 错误类型
export type ErrorType = 
  | 'PERMISSION_DENIED' 
  | 'NETWORK_ERROR' 
  | 'API_ERROR' 
  | 'AUDIO_ERROR' 
  | 'INPUT_ERROR'
  | 'AI_ERROR'
  | 'UNKNOWN_ERROR'

// 应用错误
export interface AppError {
  type: ErrorType
  message: string
  details?: string
  timestamp: number
}

// IPC 通道定义
export enum IpcChannels {
  // 录音相关
  START_RECORDING = 'start-recording',
  STOP_RECORDING = 'stop-recording',
  RECORDING_STATUS_CHANGED = 'recording-status-changed',
  RECORDING_DURATION_UPDATED = 'recording-duration-updated',
  
  // 处理结果
  PROCESSING_RESULT = 'processing-result',
  PROCESSING_ERROR = 'processing-error',
  
  // 设置相关
  GET_SETTINGS = 'get-settings',
  SET_SETTINGS = 'set-settings',
  SETTINGS_UPDATED = 'settings-updated',
  
  // 历史记录
  GET_HISTORY = 'get-history',
  ADD_HISTORY = 'add-history',
  DELETE_HISTORY = 'delete-history',
  CLEAR_HISTORY = 'clear-history',
  SEARCH_HISTORY = 'search-history',
  EXPORT_HISTORY = 'export-history',
  
  // 窗口控制
  SHOW_SETTINGS = 'show-settings',
  SHOW_HISTORY = 'show-history',
  CLOSE_WINDOW = 'close-window',
  MINIMIZE_WINDOW = 'minimize-window',
  
  // 悬浮球
  UPDATE_FLOAT_POSITION = 'update-float-position',
  MOVE_FLOAT_WINDOW = 'move-float-window',
  GET_FLOAT_POSITION = 'get-float-position',
  
  // 快捷键
  UPDATE_SHORTCUTS = 'update-shortcuts',
  
  // AI 功能
  AI_ASSISTANT = 'ai-assistant',
  TRANSLATE = 'translate',
  
  // 系统
  GET_APP_VERSION = 'get-app-version',
  CHECK_FOR_UPDATES = 'check-for-updates',
  QUIT_APP = 'quit-app'
}

// 支持的语言列表
export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁体中文' },
  { code: 'en-US', name: '英语 (美国)' },
  { code: 'en-GB', name: '英语 (英国)' },
  { code: 'ja-JP', name: '日语' },
  { code: 'ko-KR', name: '韩语' },
  { code: 'fr-FR', name: '法语' },
  { code: 'de-DE', name: '德语' },
  { code: 'es-ES', name: '西班牙语' },
  { code: 'ru-RU', name: '俄语' }
]

// 语调风格选项
export const TONE_STYLES = [
  { value: 'formal', label: '正式', description: '适合正式场合和专业文档' },
  { value: 'casual', label: '随意', description: '适合日常交流和非正式场合' },
  { value: 'professional', label: '专业', description: '适合工作场合和商务沟通' },
  { value: 'creative', label: '创意', description: '适合创意写作和表达个性' }
]
