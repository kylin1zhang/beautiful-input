import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, shell, Notification } from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'

// 模块导入
import { RecordingModule } from './modules/recording/index.js'
import { TranscriptionModule } from './modules/transcription/index.js'
import { AiProcessorModule } from './modules/ai-processor/index.js'
import { InputSimulatorModule } from './modules/input-simulator/index.js'
import { SettingsModule } from './modules/settings/index.js'
import { ShortcutsModule } from './modules/shortcuts/index.js'
import { HistoryModule } from './modules/history/index.js'

// 服务导入
import { StoreService } from './services/store.service.js'

// 类型和常量
import { IpcChannels, UserSettings, defaultSettings } from '@shared/types/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 窗口引用
let floatWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let historyWindow: BrowserWindow | null = null
let tray: Tray | null = null

// 模块实例
let recordingModule: RecordingModule
let transcriptionModule: TranscriptionModule
let aiProcessorModule: AiProcessorModule
let inputSimulatorModule: InputSimulatorModule
let settingsModule: SettingsModule
let shortcutsModule: ShortcutsModule
let historyModule: HistoryModule
let storeService: StoreService

// 应用状态
let isRecording = false
let currentRecordingDuration = 0
let recordingTimer: NodeJS.Timeout | null = null

/**
 * 创建悬浮球窗口
 */
function createFloatWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 80,
    height: 80,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    focusable: false, // 关键：让窗口不获取焦点，这样点击后不会让其他应用失去焦点
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // 加载悬浮球页面
  if (process.env.NODE_ENV === 'development') {
    // electron-vite 会自动处理正确的端口
    window.loadURL('http://localhost:5173/float.html')
  } else {
    window.loadFile(join(__dirname, '../renderer/float.html'))
  }

  // 恢复上次位置
  const position = storeService.getFloatPosition()
  if (position) {
    window.setPosition(position.x, position.y)
  } else {
    // 默认位置：屏幕右下角
    const { width, height } = window.getBounds()
    const { workArea } = require('electron').screen.getPrimaryDisplay()
    window.setPosition(workArea.width - width - 20, workArea.height - height - 20)
  }

  // 监听窗口移动事件，保存位置
  window.on('moved', () => {
    const bounds = window.getBounds()
    storeService.setFloatPosition({ x: bounds.x, y: bounds.y })
  })

  return window
}

/**
 * 创建设置窗口
 */
function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return settingsWindow
  }

  const window = new BrowserWindow({
    width: 650,
    height: 750,
    minWidth: 550,
    minHeight: 600,
    title: 'BeautifulInput 设置',
    icon: getAppIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  if (process.env.NODE_ENV === 'development') {
    window.loadURL('http://localhost:5173/settings.html')
  } else {
    window.loadFile(join(__dirname, '../renderer/settings.html'))
  }

  window.on('closed', () => {
    settingsWindow = null
  })

  return window
}

/**
 * 创建历史记录窗口
 */
function createHistoryWindow(): BrowserWindow {
  if (historyWindow && !historyWindow.isDestroyed()) {
    historyWindow.focus()
    return historyWindow
  }

  const window = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    title: 'BeautifulInput 历史记录',
    icon: getAppIcon(),
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  if (process.env.NODE_ENV === 'development') {
    window.loadURL('http://localhost:5173/history.html')
  } else {
    window.loadFile(join(__dirname, '../renderer/history.html'))
  }

  window.on('closed', () => {
    historyWindow = null
  })

  return window
}

/**
 * 获取应用图标
 */
function getAppIcon(): nativeImage {
  const iconPath = join(__dirname, '../../resources/icon.png')
  return nativeImage.createFromPath(iconPath)
}

/**
 * 创建系统托盘
 */
function createTray(): void {
  const icon = getAppIcon().resize({ width: 16, height: 16 })
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '开始/停止录音',
      click: () => toggleRecording()
    },
    { type: 'separator' },
    {
      label: '设置',
      click: () => {
        settingsWindow = createSettingsWindow()
      }
    },
    {
      label: '历史记录',
      click: () => {
        historyWindow = createHistoryWindow()
      }
    },
    { type: 'separator' },
    {
      label: '显示悬浮球',
      click: () => {
        if (floatWindow) {
          floatWindow.show()
        }
      }
    },
    {
      label: '隐藏悬浮球',
      click: () => {
        if (floatWindow) {
          floatWindow.hide()
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('BeautifulInput - AI语音输入工具')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (floatWindow) {
      floatWindow.isVisible() ? floatWindow.hide() : floatWindow.show()
    }
  })
}

/**
 * 切换录音状态
 */
async function toggleRecording(): Promise<void> {
  if (isRecording) {
    await stopRecording()
  } else {
    await startRecording()
  }
}

/**
 * 开始录音
 */
async function startRecording(): Promise<void> {
  try {
    // 如果已经在录音中，先尝试停止
    if (isRecording) {
      console.log('[Main] 检测到录音状态冲突，尝试重置')
      await stopRecording()
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // 检查权限
    const hasPermission = await recordingModule.checkPermission()
    if (!hasPermission) {
      const errorMsg = '请允许 BeautifulInput 访问麦克风'
      floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
        status: 'error'
      })
      floatWindow?.webContents.send(IpcChannels.PROCESSING_ERROR, {
        type: 'PERMISSION_DENIED',
        message: errorMsg
      })
      // 显示系统通知
      if (Notification.isSupported()) {
        new Notification({
          title: 'BeautifulInput 错误',
          body: errorMsg,
          icon: getAppIcon()
        }).show()
      }
      setTimeout(() => {
        floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
          status: 'idle'
        })
      }, 3000)
      return
    }

    // 开始录音
    await recordingModule.startRecording()
    isRecording = true
    currentRecordingDuration = 0

    // 更新悬浮球状态
    floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
      status: 'recording',
      duration: 0
    })

    // 启动计时器
    recordingTimer = setInterval(() => {
      currentRecordingDuration++
      floatWindow?.webContents.send(IpcChannels.RECORDING_DURATION_UPDATED, {
        duration: currentRecordingDuration
      })

      // 检查最大录音时长
      if (currentRecordingDuration >= 600) {
        stopRecording()
      }
    }, 1000)

    console.log('[Main] 开始录音')
  } catch (error) {
    console.error('[Main] 开始录音失败:', error)
    // 重置状态
    isRecording = false
    if (recordingTimer) {
      clearInterval(recordingTimer)
      recordingTimer = null
    }
    const errorMsg = '开始录音失败'
    floatWindow?.webContents.send(IpcChannels.PROCESSING_ERROR, {
      type: 'AUDIO_ERROR',
      message: errorMsg,
      details: (error as Error).message
    })
    // 显示系统通知
    if (Notification.isSupported()) {
      new Notification({
        title: 'BeautifulInput 错误',
        body: errorMsg,
        icon: getAppIcon()
      }).show()
    }
  }
}

/**
 * 停止录音
 */
async function stopRecording(): Promise<void> {
  if (!isRecording) return

  try {
    // 停止计时器
    if (recordingTimer) {
      clearInterval(recordingTimer)
      recordingTimer = null
    }

    // 更新状态为处理中
    floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
      status: 'processing'
    })

    // 停止录音并获取音频数据
    const audioBuffer = await recordingModule.stopRecording()
    isRecording = false

    // 检查录音时长
    if (currentRecordingDuration < 1) {
      const errorMsg = '录音时间太短，请至少说话1秒'
      floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
        status: 'error'
      })
      floatWindow?.webContents.send(IpcChannels.PROCESSING_ERROR, {
        type: 'AUDIO_ERROR',
        message: errorMsg
      })
      // 显示系统通知
      if (Notification.isSupported()) {
        new Notification({
          title: 'BeautifulInput 提示',
          body: errorMsg,
          icon: getAppIcon()
        }).show()
      }
      setTimeout(() => {
        floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
          status: 'idle'
        })
      }, 3000)
      return
    }

    console.log('[Main] 停止录音，开始处理...')

    // 语音识别
    const settings = settingsModule.getSettings()
    console.log('[Main] 当前设置:', JSON.stringify({
      groqApiKey: settings.groqApiKey ? `已配置 (${settings.groqApiKey.substring(0, 10)}...)` : '未配置',
      deepseekApiKey: settings.deepseekApiKey ? `已配置 (${settings.deepseekApiKey.substring(0, 10)}...)` : '未配置',
      qwenApiKey: settings.qwenApiKey ? `已配置 (${settings.qwenApiKey.substring(0, 10)}...)` : '未配置',
      aiProvider: settings.aiProvider
    }))

    const transcriptionResult = await transcriptionModule.transcribe(
      audioBuffer,
      settings.groqApiKey,
      settings.personalDictionary
    )

    if (!transcriptionResult.success || !transcriptionResult.text) {
      throw new Error(transcriptionResult.error || '语音识别失败')
    }

    console.log('[Main] 语音识别结果:', transcriptionResult.text)

    // AI 处理 - 根据用户选择的服务提供商
    const aiProvider = settings.aiProvider || 'deepseek'
    const apiKey = aiProvider === 'qwen' ? settings.qwenApiKey : settings.deepseekApiKey

    console.log('[Main] AI 服务提供商:', aiProvider)
    console.log('[Main] 使用的 API Key:', aiProvider === 'qwen' ? 'qwenApiKey' : 'deepseekApiKey')
    console.log('[Main] API Key 配置状态:', apiKey ? `已配置 (${apiKey.substring(0, 10)}...)` : '未配置')

    const processedResult = await aiProcessorModule.process(
      transcriptionResult.text,
      'clean',
      apiKey,
      settings.toneStyle,
      undefined,
      aiProvider
    )

    if (!processedResult.success || !processedResult.result) {
      throw new Error(processedResult.error || 'AI 处理失败')
    }

    console.log('[Main] AI 处理结果:', processedResult.result)

    // 模拟键盘输入
    const inputSuccess = await inputSimulatorModule.typeText(processedResult.result)

    if (!inputSuccess) {
      // 输入失败，复制到剪贴板
      const errorMsg = '无法输入到当前应用，已复制到剪贴板'
      const { clipboard } = require('electron')
      clipboard.writeText(processedResult.result)
      floatWindow?.webContents.send(IpcChannels.PROCESSING_ERROR, {
        type: 'INPUT_ERROR',
        message: errorMsg
      })
      // 显示系统通知
      if (Notification.isSupported()) {
        new Notification({
          title: 'BeautifulInput 提示',
          body: errorMsg,
          icon: getAppIcon()
        }).show()
      }
    }

    // 保存到历史记录
    const activeApp = await inputSimulatorModule.getActiveApplication()
    await historyModule.addHistory({
      originalText: transcriptionResult.text,
      processedText: processedResult.result,
      timestamp: Date.now(),
      appName: activeApp,
      duration: currentRecordingDuration
    })

    // 发送处理结果
    floatWindow?.webContents.send(IpcChannels.PROCESSING_RESULT, {
      originalText: transcriptionResult.text,
      processedText: processedResult.result,
      timestamp: Date.now(),
      appName: activeApp,
      duration: currentRecordingDuration
    })

    // 恢复空闲状态
    floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
      status: 'idle'
    })

    console.log('[Main] 处理完成')
  } catch (error) {
    console.error('[Main] 处理失败:', error)
    isRecording = false

    // 先发送错误状态，确保能显示错误图标
    floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
      status: 'error'
    })

    // 构建清晰的错误消息
    let errorMessage = '处理失败'
    const errorObj = error as Error

    if (errorObj.message) {
      // 根据错误类型提供更友好的提示
      if (errorObj.message.includes('千问') || errorObj.message.includes('qwen')) {
        errorMessage = '请先在设置中配置 千问 API Key'
      } else if (errorObj.message.includes('DeepSeek') || errorObj.message.includes('deepseek')) {
        errorMessage = '请先在设置中配置 DeepSeek API Key'
      } else if (errorObj.message.includes('Groq') || errorObj.message.includes('groq')) {
        errorMessage = '请先在设置中配置 Groq API Key（用于语音识别）'
      } else if (errorObj.message.includes('未配置') || errorObj.message.includes('API Key')) {
        errorMessage = '请先在设置中配置 API Key'
      } else if (errorObj.message.includes('网络') || errorObj.message.includes('fetch')) {
        errorMessage = '网络连接失败，请检查网络'
      } else if (errorObj.message.includes('识别') || errorObj.message.includes('转录')) {
        errorMessage = '语音识别失败，请重试'
      } else {
        errorMessage = errorObj.message
      }
    }

    // 发送错误消息到悬浮球
    floatWindow?.webContents.send(IpcChannels.PROCESSING_ERROR, {
      type: 'UNKNOWN_ERROR',
      message: errorMessage,
      details: errorObj.message
    })

    // 显示系统通知，确保用户能看到错误
    if (Notification.isSupported()) {
      new Notification({
        title: 'BeautifulInput 错误',
        body: errorMessage,
        icon: getAppIcon()
      }).show()
    }

    // 3秒后恢复空闲状态
    setTimeout(() => {
      floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
        status: 'idle'
      })
    }, 3000)
  }
}

/**
 * 注册 IPC 处理器
 */
function registerIpcHandlers(): void {
  // 录音控制
  ipcMain.handle(IpcChannels.START_RECORDING, startRecording)
  ipcMain.handle(IpcChannels.STOP_RECORDING, stopRecording)

  // 设置相关
  ipcMain.handle(IpcChannels.GET_SETTINGS, () => {
    return settingsModule.getSettings()
  })

  ipcMain.handle(IpcChannels.SET_SETTINGS, (_, settings: Partial<UserSettings>) => {
    settingsModule.setSettings(settings)
    // 重新注册快捷键
    shortcutsModule.unregisterAll()
    shortcutsModule.registerAll(settingsModule.getSettings().shortcuts, {
      toggleRecording
    })
    // 通知所有窗口设置已更新
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.webContents.send('settings-updated')
    }
  })

  // 历史记录
  ipcMain.handle(IpcChannels.GET_HISTORY, (_, options) => {
    return historyModule.getHistory(options)
  })

  ipcMain.handle(IpcChannels.DELETE_HISTORY, (_, id: string) => {
    return historyModule.deleteHistory(id)
  })

  ipcMain.handle(IpcChannels.CLEAR_HISTORY, () => {
    return historyModule.clearHistory()
  })

  ipcMain.handle(IpcChannels.SEARCH_HISTORY, (_, query: string) => {
    return historyModule.searchHistory(query)
  })

  ipcMain.handle(IpcChannels.EXPORT_HISTORY, (_, format: 'txt' | 'md') => {
    return historyModule.exportHistory(format)
  })

  // 窗口控制
  ipcMain.handle(IpcChannels.SHOW_SETTINGS, () => {
    settingsWindow = createSettingsWindow()
  })

  ipcMain.handle(IpcChannels.SHOW_HISTORY, () => {
    historyWindow = createHistoryWindow()
  })

  ipcMain.handle(IpcChannels.CLOSE_WINDOW, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.close()
  })

  ipcMain.handle(IpcChannels.MINIMIZE_WINDOW, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    window?.minimize()
  })

  // 悬浮球位置
  ipcMain.handle(IpcChannels.UPDATE_FLOAT_POSITION, (_, position) => {
    storeService.setFloatPosition(position)
    // 同时更新窗口位置
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.setPosition(position.x, position.y)
    }
  })

  ipcMain.handle(IpcChannels.MOVE_FLOAT_WINDOW, (_, position) => {
    if (floatWindow && !floatWindow.isDestroyed()) {
      floatWindow.setPosition(position.x, position.y)
    }
  })

  ipcMain.handle(IpcChannels.GET_FLOAT_POSITION, () => {
    return storeService.getFloatPosition()
  })

  // AI 功能
  ipcMain.handle(IpcChannels.AI_ASSISTANT, async (_, { text, action }) => {
    const settings = settingsModule.getSettings()
    const mode = action === 'summarize' ? 'assistant' : action === 'explain' ? 'assistant' : 'assistant'
    return aiProcessorModule.process(text, mode, settings.deepseekApiKey, settings.toneStyle, action)
  })

  ipcMain.handle(IpcChannels.TRANSLATE, async (_, { text, targetLanguage }) => {
    const settings = settingsModule.getSettings()
    return aiProcessorModule.translate(text, targetLanguage, settings.deepseekApiKey)
  })

  // 系统
  ipcMain.handle(IpcChannels.GET_APP_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IpcChannels.QUIT_APP, () => {
    app.quit()
  })
}

/**
 * 应用就绪
 */
app.whenReady().then(async () => {
  // 设置应用用户模型 ID（Windows）
  electronApp.setAppUserModelId('com.beautifulinput.app')

  // 初始化服务
  storeService = new StoreService()
  settingsModule = new SettingsModule(storeService)
  historyModule = new HistoryModule(storeService)
  recordingModule = new RecordingModule()
  transcriptionModule = new TranscriptionModule()
  aiProcessorModule = new AiProcessorModule()
  inputSimulatorModule = new InputSimulatorModule()
  shortcutsModule = new ShortcutsModule()

  // 创建窗口
  floatWindow = createFloatWindow()
  createTray()

  // 注册 IPC 处理器
  registerIpcHandlers()

  // 注册全局快捷键
  const settings = settingsModule.getSettings()
  shortcutsModule.registerAll(settings.shortcuts, {
    toggleRecording
  })

  // 默认打开开发工具（开发模式）
  // 临时禁用以测试 electronAPI 是否可用
  // if (process.env.NODE_ENV === 'development') {
  //   floatWindow.webContents.openDevTools({ mode: 'detach' })
  // }

  console.log('[Main] BeautifulInput 已启动')
})

/**
 * 应用即将退出
 */
app.on('will-quit', () => {
  // 注销所有快捷键
  shortcutsModule.unregisterAll()
  globalShortcut.unregisterAll()
})

/**
 * 所有窗口关闭
 */
app.on('window-all-closed', () => {
  // macOS 上保持应用运行
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

/**
 * 应用激活
 */
app.on('activate', () => {
  if (floatWindow === null) {
    floatWindow = createFloatWindow()
  }
})

/**
 * 阻止新窗口创建
 */
app.on('web-contents-created', (_, contents) => {
  contents.on('new-window', (event, url) => {
    event.preventDefault()
    shell.openExternal(url)
  })
})
