import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels, UserSettings, HistoryItem, FloatPosition, HardwareInfo, LocalModelInfo, LocalModelType, ModelDownloadState, DiskSpaceInfo, ModelsMigrateState, AIProviderConfig, LocalLLMModel, LLMHardwareInfo, LLMDownloadProgress, StreamingASRResult, StreamingASRStatus, StreamingASRError, Term, PreviewContent } from '@shared/types'

// API 类型定义
interface BeautifulInputAPI {
  // 录音控制
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  onRecordingStatusChanged: (callback: (event: unknown, data: { status: string; duration?: number }) => void) => void
  onRecordingDurationUpdated: (callback: (event: unknown, data: { duration: number }) => void) => void

  // 处理结果
  onProcessingResult: (callback: (event: unknown, result: {
    originalText: string
    processedText: string
    timestamp: number
    appName: string
    duration: number
  }) => void) => void
  onProcessingError: (callback: (event: unknown, error: {
    type: string
    message: string
    details?: string
  }) => void) => void

  // 设置
  getSettings: () => Promise<UserSettings>
  setSettings: (settings: Partial<UserSettings>) => Promise<void>
  onSettingsUpdated: (callback: (event: unknown) => void) => void

  // 历史记录
  getHistory: (options?: { page?: number; limit?: number }) => Promise<{
    items: HistoryItem[]
    total: number
    page: number
    totalPages: number
  }>
  deleteHistory: (id: string) => Promise<boolean>
  clearHistory: () => Promise<boolean>
  searchHistory: (query: string) => Promise<HistoryItem[]>
  exportHistory: (format: 'txt' | 'md') => Promise<string>

  // 窗口控制
  showSettings: () => Promise<void>
  showHistory: () => Promise<void>
  closeWindow: () => Promise<void>
  minimizeWindow: () => Promise<void>

  // 悬浮球位置
  updateFloatPosition: (position: FloatPosition) => Promise<void>
  moveFloatWindow: (position: FloatPosition) => Promise<void>
  getFloatPosition: () => Promise<FloatPosition | null>

  // 悬浮球拖动
  floatDragStart: (mousePos: FloatPosition) => Promise<void>
  floatDragMove: (mousePos: FloatPosition) => Promise<void>
  floatDragEnd: () => Promise<void>

  // 悬停状态
  onHoverStateChanged: (callback: (isHovering: boolean) => void) => void
  removeHoverListener: () => void

  // AI 功能
  translate: (params: { text: string; targetLanguage: string }) => Promise<{
    success: boolean
    result?: string
    error?: string
  }>

  // 系统
  getAppVersion: () => Promise<string>
  quitApp: () => Promise<void>

  // 本地模型相关
  detectHardware: () => Promise<HardwareInfo>
  getHardwareInfo: () => Promise<HardwareInfo | undefined>
  getLocalModels: () => Promise<LocalModelInfo[]>
  downloadModel: (modelType: LocalModelType) => Promise<boolean>
  cancelDownload: (modelType: LocalModelType) => Promise<boolean>
  deleteModel: (modelType: LocalModelType) => Promise<boolean>
  testLocalTranscription: () => Promise<{ success: boolean; message: string }>
  onModelDownloadProgress: (callback: (event: unknown, data: ModelDownloadState) => void) => void

  // Whisper 可执行文件相关
  checkWhisper: () => Promise<boolean>
  installWhisper: () => Promise<boolean>

  // 模型路径相关
  getModelsPath: () => Promise<{ current: string; isCustom: boolean; default: string; defaultParent: string }>
  selectModelsPath: () => Promise<string | null>
  migrateModels: (newPath: string) => Promise<{ success: boolean; error?: string }>
  getDiskSpace: (path?: string) => Promise<DiskSpaceInfo>
  onModelsMigrateProgress: (callback: (event: unknown, data: ModelsMigrateState) => void) => void

  // AI Provider 管理
  getAIProviders: () => Promise<AIProviderConfig[]>
  setAIProvider: (providerId: string, modelId?: string) => Promise<void>
  validateAIApiKey: (providerId: string, apiKey: string) => Promise<boolean>
  addCustomAIProvider: (config: AIProviderConfig) => Promise<boolean>
  removeAIProvider: (providerId: string) => Promise<boolean>

  // 本地 LLM
  getLocalLLMModels: () => Promise<LocalLLMModel[]>
  getLocalLLMStatus: () => Promise<{ isRunning: boolean; port: number; model: string; backend: string }>
  detectLLMHardware: () => Promise<LLMHardwareInfo>
  downloadLocalLLMModel: (modelId: string) => Promise<string>
  startLocalLLM: (modelId: string, options?: { port?: number; threads?: number; gpuLayers?: number; backend?: 'cpu' | 'cuda' | 'metal' }) => Promise<number>
  stopLocalLLM: () => Promise<void>
  cancelLLMDownload: (modelId: string) => Promise<void>
  deleteLocalLLMModel: (modelId: string) => Promise<boolean>
  onLLMDownloadProgress: (callback: (event: unknown, data: LLMDownloadProgress) => void) => void

  // 预览窗口
  onPreviewUpdate: (callback: (data: PreviewContent) => void) => void
  onPreviewFadeOut: (callback: () => void) => void

  // 流式 ASR
  onStreamingASRText: (callback: (result: StreamingASRResult) => void) => void
  onStreamingASRStatus: (callback: (status: StreamingASRStatus) => void) => void
  onStreamingASRError: (callback: (error: StreamingASRError) => void) => void

  // 术语管理
  getTerms: () => Promise<Term[]>
  addTerm: (term: string, aliases: string[]) => Promise<Term>
  updateTerm: (id: string, updates: Partial<Term>) => Promise<Term | null>
  deleteTerm: (id: string) => Promise<boolean>

  // 文字替换
  getSelectedText: () => Promise<string>
  replaceSelectedText: (text: string) => Promise<boolean>

  // 移除监听器
  removeAllListeners: (channel: string) => void
}

// 暴露 API 到渲染进程
const api: BeautifulInputAPI = {
  // 录音控制
  startRecording: () => ipcRenderer.invoke(IpcChannels.START_RECORDING),
  stopRecording: () => ipcRenderer.invoke(IpcChannels.STOP_RECORDING),
  onRecordingStatusChanged: (callback) => {
    ipcRenderer.on(IpcChannels.RECORDING_STATUS_CHANGED, callback)
  },
  onRecordingDurationUpdated: (callback) => {
    ipcRenderer.on(IpcChannels.RECORDING_DURATION_UPDATED, callback)
  },

  // 处理结果
  onProcessingResult: (callback) => {
    ipcRenderer.on(IpcChannels.PROCESSING_RESULT, callback)
  },
  onProcessingError: (callback) => {
    ipcRenderer.on(IpcChannels.PROCESSING_ERROR, callback)
  },

  // 设置
  getSettings: () => ipcRenderer.invoke(IpcChannels.GET_SETTINGS),
  setSettings: (settings) => ipcRenderer.invoke(IpcChannels.SET_SETTINGS, settings),
  onSettingsUpdated: (callback) => {
    ipcRenderer.on('settings-updated', callback)
  },

  // 历史记录
  getHistory: (options) => ipcRenderer.invoke(IpcChannels.GET_HISTORY, options),
  deleteHistory: (id) => ipcRenderer.invoke(IpcChannels.DELETE_HISTORY, id),
  clearHistory: () => ipcRenderer.invoke(IpcChannels.CLEAR_HISTORY),
  searchHistory: (query) => ipcRenderer.invoke(IpcChannels.SEARCH_HISTORY, query),
  exportHistory: (format) => ipcRenderer.invoke(IpcChannels.EXPORT_HISTORY, format),

  // 窗口控制
  showSettings: () => ipcRenderer.invoke(IpcChannels.SHOW_SETTINGS),
  showHistory: () => ipcRenderer.invoke(IpcChannels.SHOW_HISTORY),
  closeWindow: () => ipcRenderer.invoke(IpcChannels.CLOSE_WINDOW),
  minimizeWindow: () => ipcRenderer.invoke(IpcChannels.MINIMIZE_WINDOW),

  // 悬浮球位置
  updateFloatPosition: (position) => ipcRenderer.invoke(IpcChannels.UPDATE_FLOAT_POSITION, position),
  moveFloatWindow: (position) => ipcRenderer.invoke(IpcChannels.MOVE_FLOAT_WINDOW, position),
  getFloatPosition: () => ipcRenderer.invoke(IpcChannels.GET_FLOAT_POSITION),

  // 悬浮球拖动
  floatDragStart: (mousePos) => ipcRenderer.invoke('float-drag-start', mousePos),
  floatDragMove: (mousePos) => ipcRenderer.invoke('float-drag-move', mousePos),
  floatDragEnd: () => ipcRenderer.invoke('float-drag-end'),

  // 悬停状态监听
  onHoverStateChanged: (callback) => {
    ipcRenderer.on('hover-state', (_, isHovering) => callback(isHovering))
  },
  removeHoverListener: () => {
    ipcRenderer.removeAllListeners('hover-state')
  },

  // AI 功能
  translate: (params) => ipcRenderer.invoke(IpcChannels.TRANSLATE, params),

  // 系统
  getAppVersion: () => ipcRenderer.invoke(IpcChannels.GET_APP_VERSION),
  quitApp: () => ipcRenderer.invoke(IpcChannels.QUIT_APP),

  // 本地模型相关
  detectHardware: () => ipcRenderer.invoke(IpcChannels.DETECT_HARDWARE),
  getHardwareInfo: () => ipcRenderer.invoke(IpcChannels.GET_HARDWARE_INFO),
  getLocalModels: () => ipcRenderer.invoke(IpcChannels.GET_LOCAL_MODELS),
  downloadModel: (modelType) => ipcRenderer.invoke(IpcChannels.DOWNLOAD_MODEL, modelType),
  cancelDownload: (modelType) => ipcRenderer.invoke(IpcChannels.CANCEL_DOWNLOAD, modelType),
  deleteModel: (modelType) => ipcRenderer.invoke(IpcChannels.DELETE_MODEL, modelType),
  testLocalTranscription: () => ipcRenderer.invoke(IpcChannels.TEST_LOCAL_TRANSCRIPTION),
  onModelDownloadProgress: (callback) => {
    ipcRenderer.on(IpcChannels.MODEL_DOWNLOAD_PROGRESS, callback)
  },

  // Whisper 可执行文件相关
  checkWhisper: () => ipcRenderer.invoke(IpcChannels.CHECK_WHISPER),
  installWhisper: () => ipcRenderer.invoke(IpcChannels.INSTALL_WHISPER),

  // 模型路径相关
  getModelsPath: () => ipcRenderer.invoke(IpcChannels.GET_MODELS_PATH),
  selectModelsPath: () => ipcRenderer.invoke(IpcChannels.SELECT_MODELS_PATH),
  migrateModels: (newPath) => ipcRenderer.invoke(IpcChannels.MIGRATE_MODELS, newPath),
  getDiskSpace: (path) => ipcRenderer.invoke(IpcChannels.GET_DISK_SPACE, path),
  onModelsMigrateProgress: (callback) => {
    ipcRenderer.on(IpcChannels.MODELS_MIGRATE_PROGRESS, callback)
  },

  // AI Provider 管理
  getAIProviders: () => ipcRenderer.invoke(IpcChannels.GET_AI_PROVIDERS),
  setAIProvider: (providerId, modelId) => ipcRenderer.invoke(IpcChannels.SET_AI_PROVIDER, providerId, modelId),
  validateAIApiKey: (providerId, apiKey) => ipcRenderer.invoke(IpcChannels.VALIDATE_AI_API_KEY, providerId, apiKey),
  addCustomAIProvider: (config) => ipcRenderer.invoke(IpcChannels.ADD_CUSTOM_AI_PROVIDER, config),
  removeAIProvider: (providerId) => ipcRenderer.invoke(IpcChannels.REMOVE_AI_PROVIDER, providerId),

  // 本地 LLM
  getLocalLLMModels: () => ipcRenderer.invoke(IpcChannels.GET_LOCAL_LLM_MODELS),
  getLocalLLMStatus: () => ipcRenderer.invoke(IpcChannels.GET_LOCAL_LLM_STATUS),
  detectLLMHardware: () => ipcRenderer.invoke(IpcChannels.DETECT_LLM_HARDWARE),
  downloadLocalLLMModel: (modelId) => ipcRenderer.invoke(IpcChannels.DOWNLOAD_LOCAL_LLM_MODEL, modelId),
  startLocalLLM: (modelId, options) => ipcRenderer.invoke(IpcChannels.START_LOCAL_LLM, modelId, options),
  stopLocalLLM: () => ipcRenderer.invoke(IpcChannels.STOP_LOCAL_LLM),
  cancelLLMDownload: (modelId) => ipcRenderer.invoke(IpcChannels.CANCEL_LLM_DOWNLOAD, modelId),
  deleteLocalLLMModel: (modelId) => ipcRenderer.invoke(IpcChannels.DELETE_LOCAL_LLM_MODEL, modelId),
  onLLMDownloadProgress: (callback) => {
    ipcRenderer.on(IpcChannels.LOCAL_LLM_DOWNLOAD_PROGRESS, callback)
  },

  // 预览窗口
  onPreviewUpdate: (callback) => {
    ipcRenderer.on('preview-update', (_, data) => callback(data))
  },
  onPreviewFadeOut: (callback) => {
    ipcRenderer.on('preview-fade-out', () => callback())
  },

  // 流式 ASR
  onStreamingASRText: (callback) => {
    ipcRenderer.on(IpcChannels.STREAMING_ASR_TEXT, (_, result) => callback(result))
  },
  onStreamingASRStatus: (callback) => {
    ipcRenderer.on(IpcChannels.STREAMING_ASR_STATUS, (_, status) => callback(status))
  },
  onStreamingASRError: (callback) => {
    ipcRenderer.on(IpcChannels.STREAMING_ASR_ERROR, (_, error) => callback(error))
  },

  // 术语管理
  getTerms: () => ipcRenderer.invoke(IpcChannels.TERM_LIST),
  addTerm: (term, aliases) => ipcRenderer.invoke(IpcChannels.TERM_ADD, term, aliases),
  updateTerm: (id, updates) => ipcRenderer.invoke(IpcChannels.TERM_UPDATE, id, updates),
  deleteTerm: (id) => ipcRenderer.invoke(IpcChannels.TERM_DELETE, id),

  // 文字替换
  getSelectedText: () => ipcRenderer.invoke(IpcChannels.GET_SELECTED_TEXT),
  replaceSelectedText: (text) => ipcRenderer.invoke(IpcChannels.REPLACE_SELECTED_TEXT, text),

  // 移除监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  }
}

// 调试信息
console.log('[Preload] Preload script loaded')
console.log('[Preload] contextBridge available:', typeof contextBridge.exposeInMainWorld === 'function')
console.log('[Preload] API object keys:', Object.keys(api))

// 使用 contextBridge 暴露 API
contextBridge.exposeInMainWorld('electronAPI', api)

console.log('[Preload] electronAPI exposed to window')

// 类型声明
declare global {
  interface Window {
    electronAPI: BeautifulInputAPI
  }
}
