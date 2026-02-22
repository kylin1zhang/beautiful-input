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
  openaiApiKey: string  // OpenAI API Key (用于 Whisper 等服务)
  deepseekApiKey: string
  qwenApiKey: string
  asrProvider: 'groq' | 'openai' | 'local'  // 语音识别服务提供商选择
  aiProvider: 'deepseek' | 'qwen'  // AI 服务提供商选择

  // 快捷键设置
  shortcuts: {
    toggleRecording: string
    quickTranslate: string
  }

  // 个性化设置
  toneStyle: 'formal' | 'casual' | 'professional' | 'creative'
  personalDictionary: string[]
  defaultLanguage: string

  // 翻译设置
  translateSourceLanguage: string  // 翻译源语言（用于语音翻译）
  translateTargetLanguage: string  // 翻译目标语言（用于语音翻译）

  // 其他设置
  autoStart: boolean
  floatOpacity: number
  historyRetentionDays: number

  // 自动停止录音配置
  autoStopRecording: {
    enabled: boolean
    vadSilenceDuration: number // 毫秒（内部存储），界面显示为秒
    vadSilenceThreshold?: number // 静音检测阈值（0.010-0.030），数值越小越灵敏，建议范围：0.010-0.025
  }

  // 本地模型配置
  localModel: LocalModelSettings

  // 硬件检测结果缓存
  hardwareInfo?: HardwareInfo
}

// 默认设置
export const defaultSettings: UserSettings = {
  groqApiKey: '',
  openaiApiKey: '',
  deepseekApiKey: '',
  qwenApiKey: '',
  asrProvider: 'groq',
  aiProvider: 'deepseek',
  shortcuts: {
    toggleRecording: 'Alt+Shift+R',
    quickTranslate: 'Alt+Shift+T'
  },
  toneStyle: 'professional',
  personalDictionary: [],
  defaultLanguage: 'zh-CN',
  translateSourceLanguage: 'zh-CN',   // 默认中文翻译为英文
  translateTargetLanguage: 'en',
  autoStart: false,
  floatOpacity: 0.9,
  historyRetentionDays: 30,
  autoStopRecording: {
    enabled: true,
    vadSilenceDuration: 3500,  // 默认 3.5 秒
    vadSilenceThreshold: 0.008  // 默认值，建议范围：0.006-0.025
  },
  localModel: {
    enabled: false,
    selectedModel: 'base',
    language: 'auto',
    threads: 4,
    useGpu: true
  },
  hardwareInfo: undefined
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
export type AiProcessingMode = 'clean' | 'translate'

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

  // AI 功能
  TRANSLATE = 'translate',
  
  // 系统
  GET_APP_VERSION = 'get-app-version',
  CHECK_FOR_UPDATES = 'check-for-updates',
  QUIT_APP = 'quit-app',

  // 本地模型相关
  DETECT_HARDWARE = 'detect-hardware',
  GET_HARDWARE_INFO = 'get-hardware-info',
  GET_LOCAL_MODELS = 'get-local-models',
  DOWNLOAD_MODEL = 'download-model',
  DELETE_MODEL = 'delete-model',
  CANCEL_DOWNLOAD = 'cancel-download',
  TEST_LOCAL_TRANSCRIPTION = 'test-local-transcription',
  MODEL_DOWNLOAD_PROGRESS = 'model-download-progress',

  // Whisper 可执行文件相关
  CHECK_WHISPER = 'check-whisper',
  INSTALL_WHISPER = 'install-whisper',

  // 模型路径相关
  GET_MODELS_PATH = 'get-models-path',
  SELECT_MODELS_PATH = 'select-models-path',
  MIGRATE_MODELS = 'migrate-models',
  GET_DISK_SPACE = 'get-disk-space',
  MODELS_MIGRATE_PROGRESS = 'models-migrate-progress'
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

// 本地语音识别模型类型
export type LocalModelType = 'base' | 'small' | 'medium' | 'large-v3'

// 本地模型信息
export interface LocalModelInfo {
  type: LocalModelType
  name: string
  size: number  // 字节
  sizeDisplay: string  // 显示用，如 "142MB"
  downloaded: boolean
  downloading: boolean
  downloadProgress?: number  // 0-100
  sha256: string  // 用于校验
  url: string  // 下载地址
}

// 硬件检测结果
export interface HardwareInfo {
  platform: 'win32' | 'darwin' | 'linux'
  hasNvidia: boolean
  nvidiaGpuName?: string
  vram?: number  // MB
  isAppleSilicon: boolean
  totalMemory: number  // GB
  recommendedModel: LocalModelType
  recommendedReason: string
}

// 本地模型配置
export interface LocalModelSettings {
  enabled: boolean  // 是否启用本地模型
  selectedModel: LocalModelType
  language: string  // 'auto' | 'zh' | 'en' | ...
  threads: number  // CPU 线程数
  useGpu: boolean  // 是否使用 GPU
  customModelsPath?: string  // 自定义模型存储路径，undefined 表示使用默认路径
}

// 模型下载状态
export interface ModelDownloadState {
  modelType: LocalModelType
  status: 'idle' | 'downloading' | 'completed' | 'error'
  progress: number  // 0-100
  speed?: string  // 如 "2.5 MB/s"
  error?: string
}

// 磁盘空间信息
export interface DiskSpaceInfo {
  total: number  // 总空间（字节）
  free: number   // 可用空间（字节）
  used: number   // 已用空间（字节）
}

// 模型迁移状态
export interface ModelsMigrateState {
  status: 'idle' | 'migrating' | 'completed' | 'error'
  progress: number  // 0-100
  currentFile?: string
  error?: string
}
