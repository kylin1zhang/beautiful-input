import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, shell, Notification } from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'
import { mkdir, rename } from 'fs/promises'
import { electronApp, optimizer } from '@electron-toolkit/utils'

// 模块导入
import { RecordingModule } from './modules/recording/index.js'
import { TranscriptionModule } from './modules/transcription/index.js'
import { AiProcessorModule } from './modules/ai-processor/index.js'
import { InputSimulatorModule } from './modules/input-simulator/index.js'
import { SettingsModule } from './modules/settings/index.js'
import { ShortcutsModule } from './modules/shortcuts/index.js'
import { HistoryModule } from './modules/history/index.js'
import { HardwareDetector } from './modules/hardware-detector/index.js'
import { ModelManager } from './modules/model-manager/index.js'
import { LocalTranscriber } from './modules/local-transcriber/index.js'
import { providerRegistry } from './modules/ai-processor/registry.js'
import { localLLMModule } from './modules/local-llm/index.js'

// 服务导入
import { StoreService } from './services/store.service.js'

// 类型和常量
import { IpcChannels, UserSettings, LocalModelType, RecordingErrorType, RecordingErrorInfo, AIProviderConfig } from '@shared/types/index.js'

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
let hardwareDetector: HardwareDetector
let modelManager: ModelManager
let localTranscriber: LocalTranscriber

// 应用状态
let isRecording = false
let currentRecordingDuration = 0
let recordingTimer: NodeJS.Timeout | null = null
let isTranslateRecording = false  // 标记是否为翻译录音

/**
 * 分析录音错误，返回详细的错误信息
 */
function analyzeRecordingError(errorMessage: string): RecordingErrorInfo {
  const lowerMsg = errorMessage.toLowerCase()

  // ffmpeg 找不到或无法启动
  if (lowerMsg.includes('spawn') && lowerMsg.includes('enoent')) {
    return {
      type: RecordingErrorType.FFMPEG_NOT_FOUND,
      title: '程序文件损坏',
      message: '录音组件缺失，请重新安装 BeautifulInput',
      action: '重新下载安装'
    }
  }

  // ffmpeg 相关错误
  if (lowerMsg.includes('ffmpeg') || lowerMsg.includes('录音进程')) {
    return {
      type: RecordingErrorType.FFMPEG_NOT_FOUND,
      title: '录音组件错误',
      message: '录音组件启动失败，请重新安装 BeautifulInput',
      action: '重新下载安装'
    }
  }

  // 找不到麦克风设备
  if (lowerMsg.includes('找不到麦克风') || lowerMsg.includes('找不到设备') || lowerMsg.includes('no audio device')) {
    return {
      type: RecordingErrorType.DEVICE_NOT_FOUND,
      title: '找不到麦克风',
      message: '未检测到麦克风设备，请检查设备连接',
      action: '检查设备'
    }
  }

  // 权限被拒绝
  if (lowerMsg.includes('could not open audio device') || lowerMsg.includes('permission denied') || lowerMsg.includes('权限')) {
    return {
      type: RecordingErrorType.PERMISSION_DENIED,
      title: '麦克风权限被拒绝',
      message: '请在 Windows 设置中允许 BeautifulInput 访问麦克风',
      action: '打开系统设置'
    }
  }

  // 其他录音失败
  return {
    type: RecordingErrorType.RECORDING_FAILED,
    title: '录音启动失败',
    message: `录音启动失败: ${errorMessage}`,
    action: '重试'
  }
}

/**
 * 创建悬浮球窗口
 */
// 悬浮球尺寸
const FLOAT_BALL_SIZE = 41

/**
 * 限制悬浮球位置在屏幕范围内（完全可见，不允许半隐藏）
 * @param x 当前 x 坐标
 * @param y 当前 y 坐标
 * @param window 悬浮球窗口
 * @returns 调整后的位置
 */
function constrainFloatPosition(x: number, y: number, window: BrowserWindow): { x: number; y: number } {
  const { screen } = require('electron')
  const { width, height } = window.getBounds()

  // 获取包含窗口中心点的显示器（处理多显示器情况）
  const centerPoint = { x: x + width / 2, y: y + height / 2 }
  let display = screen.getDisplayNearestPoint(centerPoint)

  // 如果找不到，使用主显示器
  if (!display) {
    display = screen.getPrimaryDisplay()
  }

  const { workArea } = display

  // 计算边界（悬浮球必须完全在屏幕内）
  const minX = workArea.x
  const maxX = workArea.x + workArea.width - width
  const minY = workArea.y
  const maxY = workArea.y + workArea.height - height

  // 限制位置，确保完全在屏幕内
  const newX = Math.max(minX, Math.min(maxX, x))
  const newY = Math.max(minY, Math.min(maxY, y))

  return { x: Math.round(newX), y: Math.round(newY) }
}

// 悬浮球窗口尺寸（需要足够大以显示悬停菜单）
const FLOAT_WINDOW_WIDTH = 140   // 菜单宽度 + 边距
const FLOAT_WINDOW_HEIGHT = 160  // 悬浮球 41px + 菜单高度 + 边距

function createFloatWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: FLOAT_WINDOW_WIDTH,
    height: FLOAT_WINDOW_HEIGHT,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // 主进程监听悬浮球位置，定期检查鼠标是否在悬浮球附近
  let hoverCheckInterval: NodeJS.Timeout | null = null
  let isHovering = false

  const startHoverCheck = () => {
    if (hoverCheckInterval) return

    hoverCheckInterval = setInterval(() => {
      if (window.isDestroyed()) {
        if (hoverCheckInterval) {
          clearInterval(hoverCheckInterval)
          hoverCheckInterval = null
        }
        return
      }

      try {
        const { screen } = require('electron')
        const point = screen.getCursorScreenPoint()
        const bounds = window.getBounds()

        // 检查鼠标是否在悬浮球范围内（稍微扩大检测范围）
        const isNear = (
          point.x >= bounds.x - 10 &&
          point.x <= bounds.x + bounds.width + 10 &&
          point.y >= bounds.y - 10 &&
          point.y <= bounds.y + bounds.height + 10
        )

        if (isNear && !isHovering) {
          isHovering = true
          window.webContents.send('hover-state', true)
        } else if (!isNear && isHovering) {
          isHovering = false
          window.webContents.send('hover-state', false)
        }
      } catch (e) {
        // 忽略错误
      }
    }, 100) // 每100ms检查一次
  }

  // 窗口显示时开始检查
  window.once('ready-to-show', () => {
    startHoverCheck()
  })

  // 如果窗口已经显示，立即开始
  startHoverCheck()

  // 加载悬浮球页面
  if (process.env.NODE_ENV === 'development') {
    // electron-vite 会自动处理正确的端口
    window.loadURL('http://localhost:5173/float.html')
  } else {
    window.loadFile(join(__dirname, '../renderer/float.html'))
  }

  // 恢复上次位置或设置默认位置
  const position = storeService.getFloatPosition()
  if (position) {
    // 验证位置是否在屏幕范围内，如果超出则调整
    const adjustedPosition = constrainFloatPosition(position.x, position.y, window)
    window.setPosition(adjustedPosition.x, adjustedPosition.y)
    // 如果位置被调整了，保存新位置
    if (adjustedPosition.x !== position.x || adjustedPosition.y !== position.y) {
      storeService.setFloatPosition(adjustedPosition)
    }
  } else {
    // 默认位置：屏幕右侧贴边，垂直居中偏下
    const { width, height } = window.getBounds()
    const { workArea } = require('electron').screen.getPrimaryDisplay()
    // 贴边显示（x = workArea.width - width），垂直位置在屏幕高度 2/3 处
    window.setPosition(workArea.width - width, Math.floor(workArea.height * 2 / 3))
  }

  // 监听窗口移动事件，检查边界并保存位置
  window.on('moved', () => {
    const bounds = window.getBounds()
    // 检查边界
    const adjustedPosition = constrainFloatPosition(bounds.x, bounds.y, window)
    // 如果位置超出边界，自动调整回来
    if (adjustedPosition.x !== bounds.x || adjustedPosition.y !== bounds.y) {
      window.setPosition(adjustedPosition.x, adjustedPosition.y)
    }
    storeService.setFloatPosition({ x: adjustedPosition.x, y: adjustedPosition.y })
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
    autoHideMenuBar: true, // 隐藏默认菜单栏
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
    autoHideMenuBar: true, // 隐藏默认菜单栏
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
function getAppIcon(): ReturnType<typeof nativeImage.createFromPath> {
  // 生产环境使用打包后的图标，开发环境使用生成的图标
  const iconPath = process.env.NODE_ENV === 'development'
    ? join(__dirname, '../../resources/icon.png')
    : join(process.resourcesPath, 'icon.png')
  return nativeImage.createFromPath(iconPath)
}

/**
 * 获取托盘图标（使用32x32以支持高DPI显示）
 */
function getTrayIcon(): ReturnType<typeof nativeImage.createFromPath> {
  // 使用 32x32 图标以支持高 DPI 屏幕（200% 缩放）
  // Electron 会自动根据系统 DPI 缩放图标
  const iconPath = process.env.NODE_ENV === 'development'
    ? join(__dirname, '../../resources/icon-32.png')
    : join(process.resourcesPath, 'icon-32.png')
  return nativeImage.createFromPath(iconPath)
}

/**
 * 应用开机自启设置
 */
function applyAutoStartSetting(): void {
  const settings = settingsModule.getSettings()
  app.setLoginItemSettings({
    openAtLogin: settings.autoStart || false,
    openAsHidden: true, // 开机时隐藏主窗口，只显示托盘图标
    name: 'BeautifulInput'
  })
}

/**
 * 创建系统托盘
 */
function createTray(): void {
  const icon = getTrayIcon()
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
      if (floatWindow.isVisible()) {
        floatWindow.hide()
      } else {
        floatWindow.show()
      }
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

    // 获取设置（用于自动停止配置）
    const settings = settingsModule.getSettings()

    // 获取自动停止配置
    const autoStopConfig = settings.autoStopRecording || { enabled: false, vadSilenceDuration: 5000 }
    const enableVAD = autoStopConfig.enabled

    // 直接开始录音，不再预先检测权限
    // 如果权限问题导致录音失败，会在 catch 中处理
    try {
      await recordingModule.startRecording({
        enableVAD,
        vadSilenceDuration: autoStopConfig.vadSilenceDuration,
        vadSilenceThreshold: autoStopConfig.vadSilenceThreshold
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[Main] 启动录音失败:', errorMessage)

      // 分析错误类型
      const errorInfo = analyzeRecordingError(errorMessage)
      console.error('[Main] 错误类型:', errorInfo.type, errorInfo.message)

      // 更新悬浮球状态为错误
      floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
        status: 'error'
      })
      floatWindow?.webContents.send(IpcChannels.PROCESSING_ERROR, {
        type: errorInfo.type,
        message: errorInfo.message
      })

      // 显示通知
      if (Notification.isSupported()) {
        new Notification({
          title: `BeautifulInput ${errorInfo.title}`,
          body: errorInfo.message,
          icon: getAppIcon()
        }).show()
      }

      // 如果是权限问题，打开系统设置
      if (errorInfo.type === RecordingErrorType.PERMISSION_DENIED) {
        shell.openExternal('ms-settings:privacy-microphone')
      }

      // 3秒后恢复空闲状态
      setTimeout(() => {
        floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
          status: 'idle'
        })
      }, 3000)
      return
    }
    isRecording = true
    currentRecordingDuration = 0

    // 监听自动停止事件（先移除旧的监听器，避免重复注册）
    recordingModule.removeAllListeners('auto-stop')
    if (enableVAD) {
      recordingModule.once('auto-stop', ({ reason }) => {
        console.log('[Main] 自动停止触发，原因:', reason)
        if (isRecording) {
          stopRecording()
        }
      })
    }

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
      if (currentRecordingDuration >= 1800) {
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
      asrProvider: settings.asrProvider,
      localModel: settings.localModel,
      groqApiKey: settings.groqApiKey ? `已配置 (${settings.groqApiKey.substring(0, 10)}...)` : '未配置',
      openaiApiKey: settings.openaiApiKey ? `已配置 (${settings.openaiApiKey.substring(0, 10)}...)` : '未配置',
      deepseekApiKey: settings.deepseekApiKey ? `已配置 (${settings.deepseekApiKey.substring(0, 10)}...)` : '未配置',
      qwenApiKey: settings.qwenApiKey ? `已配置 (${settings.qwenApiKey.substring(0, 10)}...)` : '未配置',
      aiProvider: settings.aiProvider
    }))

    let transcriptionResult

    // 根据选择的 ASR 提供商进行语音识别
    if (settings.asrProvider === 'local') {
      // 使用本地模型
      console.log('[Main] 使用本地模型进行语音识别')

      // 确保有硬件信息
      if (!settings.hardwareInfo) {
        settings.hardwareInfo = await hardwareDetector.detect()
        settingsModule.setSettings({ hardwareInfo: settings.hardwareInfo })
      }

      transcriptionResult = await localTranscriber.transcribe(
        audioBuffer,
        settings.localModel.selectedModel,
        settings.hardwareInfo,
        settings.localModel.language,
        settings.localModel.threads,
        settings.personalDictionary  // 传递个性化字典
      )
    } else {
      // 使用 API
      const asrApiKey = settings.asrProvider === 'openai' ? settings.openaiApiKey : settings.groqApiKey

      transcriptionResult = await transcriptionModule.transcribe(
        audioBuffer,
        asrApiKey,
        settings.asrProvider,  // 'groq' | 'openai'
        settings.personalDictionary
      )
    }

    if (!transcriptionResult.success || !transcriptionResult.text) {
      throw new Error(transcriptionResult.error || '语音识别失败')
    }

    console.log('[Main] 语音识别结果:', transcriptionResult.text)

    // AI 处理 - 使用新的统一接口
    console.log('[Main] AI 服务提供商:', settings.aiProvider)

    const processedResult = await aiProcessorModule.process(
      transcriptionResult.text,
      'clean',
      settings
    )

    if (!processedResult.success || !processedResult.result) {
      throw new Error(processedResult.error || 'AI 处理失败')
    }

    console.log('[Main] AI 处理结果:', processedResult.result)

    // 使用快速剪贴板输入
    const inputSuccess = await inputSimulatorModule.typeTextFast(processedResult.result)

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
 * 语音翻译功能（录音 → 识别 → 翻译 → 输入）
 */
async function quickTranslate(): Promise<void> {
  // 如果正在录音，停止录音并执行翻译
  if (isRecording && !isTranslateRecording) {
    // 普通录音模式下，先停止当前录音，然后开始翻译录音
    await stopRecording()
    await new Promise(resolve => setTimeout(resolve, 500))
  }

  // 如果正在翻译录音，停止它
  if (isTranslateRecording) {
    await stopTranslateRecording()
    return
  }

  // 开始翻译录音
  try {
    // 尝试检测权限，但失败不阻止录音（实际录音时会验证）
    const hasPermission = await recordingModule.checkPermission()
    if (!hasPermission) {
      console.log('[Main] 权限检测未通过，但仍尝试录音')
    }

    const settings = settingsModule.getSettings()
    const autoStopConfig = settings.autoStopRecording || { enabled: false, vadSilenceDuration: 5000 }
    const enableVAD = autoStopConfig.enabled

    // 开始录音
    await recordingModule.startRecording({
      enableVAD,
      vadSilenceDuration: autoStopConfig.vadSilenceDuration,
      vadSilenceThreshold: autoStopConfig.vadSilenceThreshold
    })
    isRecording = true
    isTranslateRecording = true
    currentRecordingDuration = 0

    // 监听自动停止事件
    recordingModule.removeAllListeners('auto-stop')
    if (enableVAD) {
      recordingModule.once('auto-stop', () => {
        if (isTranslateRecording) {
          stopTranslateRecording()
        }
      })
    }

    // 更新悬浮球状态为翻译录音
    floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
      status: 'recording',
      mode: 'translate',  // 标记为翻译模式
      duration: 0
    })

    // 启动计时器
    recordingTimer = setInterval(() => {
      currentRecordingDuration++
      floatWindow?.webContents.send(IpcChannels.RECORDING_DURATION_UPDATED, {
        duration: currentRecordingDuration
      })
      if (currentRecordingDuration >= 1800) {
        stopTranslateRecording()
      }
    }, 1000)

    // 显示通知
    if (Notification.isSupported()) {
      new Notification({
        title: 'BeautifulInput 语音翻译',
        body: '开始录音，再次按快捷键停止',
        icon: getAppIcon()
      }).show()
    }

    console.log('[Main] 开始翻译录音')
  } catch (error) {
    console.error('[Main] 开始翻译录音失败:', error)
    isRecording = false
    isTranslateRecording = false
    if (recordingTimer) {
      clearInterval(recordingTimer)
      recordingTimer = null
    }
  }
}

/**
 * 停止翻译录音并处理翻译
 */
async function stopTranslateRecording(): Promise<void> {
  if (!isTranslateRecording) return

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
    isTranslateRecording = false

    // 检查录音时长
    if (currentRecordingDuration < 1) {
      const errorMsg = '录音时间太短'
      floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
        status: 'error'
      })
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

    console.log('[Main] 翻译录音停止，开始处理...')

    const settings = settingsModule.getSettings()

    let transcriptionResult

    // 根据选择的 ASR 提供商进行语音识别
    if (settings.asrProvider === 'local') {
      // 使用本地模型
      console.log('[Main] 使用本地模型进行语音识别')

      // 确保有硬件信息
      if (!settings.hardwareInfo) {
        settings.hardwareInfo = await hardwareDetector.detect()
        settingsModule.setSettings({ hardwareInfo: settings.hardwareInfo })
      }

      transcriptionResult = await localTranscriber.transcribe(
        audioBuffer,
        settings.localModel.selectedModel,
        settings.hardwareInfo,
        settings.localModel.language,
        settings.localModel.threads,
        settings.personalDictionary  // 传递个性化字典
      )
    } else {
      // 使用 API
      const asrApiKey = settings.asrProvider === 'openai' ? settings.openaiApiKey : settings.groqApiKey

      transcriptionResult = await transcriptionModule.transcribe(
        audioBuffer,
        asrApiKey,
        settings.asrProvider,  // 'groq' | 'openai'
        settings.personalDictionary
      )
    }

    if (!transcriptionResult.success || !transcriptionResult.text) {
      throw new Error(transcriptionResult.error || '语音识别失败')
    }

    console.log('[Main] 识别结果:', transcriptionResult.text)

    // 第一步：口语化处理（clean）
    const cleanResult = await aiProcessorModule.process(
      transcriptionResult.text,
      'clean',  // 使用 clean 模式进行口语化处理
      settings
    )

    if (!cleanResult.success || !cleanResult.result) {
      throw new Error(cleanResult.error || '口语化处理失败')
    }

    console.log('[Main] 口语化处理结果:', cleanResult.result)

    // 第二步：翻译处理后的文本
    const translateResult = await aiProcessorModule.process(
      cleanResult.result,  // 翻译口语化后的结果
      'translate',
      settings,
      settings.translateTargetLanguage || 'en'
    )

    if (!translateResult.success || !translateResult.result) {
      throw new Error(translateResult.error || '翻译失败')
    }

    console.log('[Main] 翻译结果:', translateResult.result)

    // 快速输入翻译结果（强制使用剪贴板）
    const inputSuccess = await inputSimulatorModule.typeTextFast(translateResult.result)

    if (!inputSuccess) {
      const { clipboard } = require('electron')
      clipboard.writeText(translateResult.result)
      if (Notification.isSupported()) {
        new Notification({
          title: 'BeautifulInput 提示',
          body: '翻译结果已复制到剪贴板',
          icon: getAppIcon()
        }).show()
      }
    }

    // 恢复空闲状态
    floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
      status: 'idle'
    })

    console.log('[Main] 语音翻译完成')
  } catch (error) {
    console.error('[Main] 语音翻译失败:', error)
    isRecording = false
    isTranslateRecording = false

    floatWindow?.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, {
      status: 'error'
    })

    if (Notification.isSupported()) {
      new Notification({
        title: 'BeautifulInput 错误',
        body: '翻译失败: ' + (error as Error).message,
        icon: getAppIcon()
      }).show()
    }

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
      toggleRecording,
      quickTranslate
    })
    // 应用开机自启设置
    if ('autoStart' in settings) {
      applyAutoStartSetting()
    }
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
      // 保存位置
      storeService.setFloatPosition({ x: position.x, y: position.y })
    }
  })

  ipcMain.handle(IpcChannels.GET_FLOAT_POSITION, () => {
    return storeService.getFloatPosition()
  })

  // AI 功能
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

  // 本地模型相关
  ipcMain.handle(IpcChannels.DETECT_HARDWARE, async () => {
    const info = await hardwareDetector.detect()
    // 缓存到设置中
    settingsModule.setSettings({ hardwareInfo: info })
    return info
  })

  ipcMain.handle(IpcChannels.GET_HARDWARE_INFO, () => {
    return settingsModule.getSettings().hardwareInfo
  })

  ipcMain.handle(IpcChannels.GET_LOCAL_MODELS, async () => {
    return modelManager.getModels()
  })

  ipcMain.handle(IpcChannels.DOWNLOAD_MODEL, async (_, modelType: LocalModelType) => {
    return modelManager.downloadModel(modelType)
  })

  ipcMain.handle(IpcChannels.CANCEL_DOWNLOAD, (_, modelType: LocalModelType) => {
    modelManager.cancelDownload(modelType)
    return true
  })

  ipcMain.handle(IpcChannels.DELETE_MODEL, async (_, modelType: LocalModelType) => {
    return modelManager.deleteModel(modelType)
  })

  ipcMain.handle(IpcChannels.TEST_LOCAL_TRANSCRIPTION, async () => {
    // TODO: 使用测试音频进行转录测试
    return { success: true, message: '测试成功' }
  })

  // Whisper 可执行文件相关
  ipcMain.handle(IpcChannels.CHECK_WHISPER, () => {
    return modelManager.isWhisperInstalled()
  })

  ipcMain.handle(IpcChannels.INSTALL_WHISPER, async () => {
    return modelManager.installWhisperFromResources()
  })

  // 模型路径相关
  ipcMain.handle(IpcChannels.GET_MODELS_PATH, () => {
    return modelManager.getPathConfig()
  })

  ipcMain.handle(IpcChannels.SELECT_MODELS_PATH, async () => {
    return modelManager.selectModelsPath()
  })

  ipcMain.handle(IpcChannels.MIGRATE_MODELS, async (_, newPath: string) => {
    const defaultParentPath = modelManager.getDefaultParentPath()
    const isResetToDefault = newPath === defaultParentPath

    // 迁移 Whisper 模型和程序
    const result = await modelManager.migrateToPath(newPath)
    if (!result.success) {
      return result
    }

    // 迁移 LLM 模型
    const oldLLMPath = localLLMModule.getModelsDir()
    const newLLMPath = join(newPath, 'llm-models')

    if (existsSync(oldLLMPath) && oldLLMPath !== newLLMPath) {
      console.log(`[Main] 迁移 LLM 模型: ${oldLLMPath} -> ${newLLMPath}`)
      try {
        // 确保目标目录的父目录存在
        await mkdir(dirname(newLLMPath), { recursive: true })

        // 移动整个目录
        if (!existsSync(newLLMPath)) {
          await rename(oldLLMPath, newLLMPath)
          console.log('[Main] LLM 模型迁移完成')
        }
      } catch (error) {
        console.error('[Main] LLM 模型迁移失败:', error)
        // 不阻止整体迁移，只是记录错误
      }
    }

    // 更新 LLM 模块的路径
    localLLMModule.setCustomBasePath(isResetToDefault ? null : newPath)

    // 更新设置中的路径
    const currentSettings = settingsModule.getSettings()
    settingsModule.setSettings({
      ...currentSettings,
      localModel: {
        ...currentSettings.localModel,
        // 如果是恢复默认，设置为 undefined，否则设置新路径
        customModelsPath: isResetToDefault ? undefined : newPath
      }
    })

    return { success: true }
  })

  ipcMain.handle(IpcChannels.GET_DISK_SPACE, (_, path?: string) => {
    return modelManager.getDiskSpaceInfo(path)
  })

  // AI Provider 相关
  ipcMain.handle(IpcChannels.GET_AI_PROVIDERS, () => {
    return providerRegistry.getAllConfigs()
  })

  ipcMain.handle(IpcChannels.SET_AI_PROVIDER, (_, providerId: string, modelId?: string) => {
    const settings = settingsModule.getSettings()
    settings.aiProvider = providerId
    if (modelId) {
      settings.aiModel = modelId
    }
    settingsModule.setSettings(settings)
  })

  ipcMain.handle(IpcChannels.VALIDATE_AI_API_KEY, async (_, providerId: string, apiKey: string) => {
    const provider = providerRegistry.getProvider(providerId)
    if (!provider) return false
    const config = providerRegistry.getConfig(providerId)
    return provider.validateApiKey(apiKey, config?.baseUrl)
  })

  ipcMain.handle(IpcChannels.ADD_CUSTOM_AI_PROVIDER, (_, config: AIProviderConfig) => {
    return providerRegistry.addCustomProvider(config)
  })

  ipcMain.handle(IpcChannels.REMOVE_AI_PROVIDER, (_, providerId: string) => {
    return providerRegistry.removeProvider(providerId)
  })

  // 本地 LLM 相关
  ipcMain.handle(IpcChannels.GET_LOCAL_LLM_MODELS, () => {
    return localLLMModule.getBuiltinModels()
  })

  ipcMain.handle(IpcChannels.GET_LOCAL_LLM_STATUS, () => {
    return localLLMModule.getStatus()
  })

  ipcMain.handle(IpcChannels.DETECT_LLM_HARDWARE, async () => {
    return localLLMModule.detectHardware()
  })

  ipcMain.handle(IpcChannels.DOWNLOAD_LOCAL_LLM_MODEL, async (_, modelId: string) => {
    return localLLMModule.downloadModel(modelId)
  })

  ipcMain.handle(IpcChannels.START_LOCAL_LLM, async (_, modelId: string, options?) => {
    return localLLMModule.startServer(modelId, options)
  })

  ipcMain.handle(IpcChannels.STOP_LOCAL_LLM, async () => {
    return localLLMModule.stopServer()
  })

  ipcMain.handle(IpcChannels.CANCEL_LLM_DOWNLOAD, (_, modelId: string) => {
    localLLMModule.cancelDownload(modelId)
  })

  ipcMain.handle(IpcChannels.DELETE_LOCAL_LLM_MODEL, (_, modelId: string) => {
    return localLLMModule.deleteModel(modelId)
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
  hardwareDetector = new HardwareDetector()
  modelManager = new ModelManager()
  localTranscriber = new LocalTranscriber()

  // 设置 LocalTranscriber 的 ModelManager 引用
  localTranscriber.setModelManager(modelManager)

  // 从设置中读取自定义模型路径（Whisper 和 LLM 共用）
  const settings = settingsModule.getSettings()
  console.log('[Main] 设置中的 customModelsPath:', settings.localModel?.customModelsPath)
  if (settings.localModel?.customModelsPath) {
    modelManager.setCustomPath(settings.localModel.customModelsPath)
    localLLMModule.setCustomBasePath(settings.localModel.customModelsPath)
    console.log('[Main] Whisper 模型路径:', modelManager.getModelsPath())
    console.log('[Main] LLM 模型路径:', localLLMModule.getModelsDir())
  }

  // 监听模型下载进度，转发到渲染进程（同时发送到设置窗口）
  modelManager.on('download-progress', (data) => {
    const progressData = {
      ...data,
      status: 'downloading'
    }
    floatWindow?.webContents.send(IpcChannels.MODEL_DOWNLOAD_PROGRESS, progressData)
    settingsWindow?.webContents.send(IpcChannels.MODEL_DOWNLOAD_PROGRESS, progressData)
  })
  modelManager.on('download-complete', (data) => {
    const progressData = {
      ...data,
      status: 'completed'
    }
    floatWindow?.webContents.send(IpcChannels.MODEL_DOWNLOAD_PROGRESS, progressData)
    settingsWindow?.webContents.send(IpcChannels.MODEL_DOWNLOAD_PROGRESS, progressData)
  })
  modelManager.on('download-error', (data) => {
    const progressData = {
      ...data,
      status: 'error'
    }
    floatWindow?.webContents.send(IpcChannels.MODEL_DOWNLOAD_PROGRESS, progressData)
    settingsWindow?.webContents.send(IpcChannels.MODEL_DOWNLOAD_PROGRESS, progressData)
  })
  modelManager.on('download-cancelled', (data) => {
    const progressData = {
      ...data,
      status: 'cancelled'
    }
    floatWindow?.webContents.send(IpcChannels.MODEL_DOWNLOAD_PROGRESS, progressData)
    settingsWindow?.webContents.send(IpcChannels.MODEL_DOWNLOAD_PROGRESS, progressData)
  })

  // 监听迁移进度
  modelManager.on('migrate-progress', (data) => {
    floatWindow?.webContents.send(IpcChannels.MODELS_MIGRATE_PROGRESS, data)
    settingsWindow?.webContents.send(IpcChannels.MODELS_MIGRATE_PROGRESS, data)
  })

  // 监听本地 LLM 下载进度
  localLLMModule.on('download-progress', (data) => {
    floatWindow?.webContents.send(IpcChannels.LOCAL_LLM_DOWNLOAD_PROGRESS, data)
    settingsWindow?.webContents.send(IpcChannels.LOCAL_LLM_DOWNLOAD_PROGRESS, data)
  })

  // 创建窗口
  floatWindow = createFloatWindow()
  createTray()

  // 注册 IPC 处理器
  registerIpcHandlers()

  // 自动安装 Whisper（从资源目录）
  modelManager.ensureWhisperInstalled().then(installed => {
    if (installed) {
      console.log('[Main] Whisper 已就绪')
    } else {
      console.log('[Main] Whisper 未安装，请将 whisper-bin-x64.zip 放在 resources/whisper/ 目录')
    }
  })

  // 注册全局快捷键
  shortcutsModule.registerAll(settings.shortcuts, {
    toggleRecording,
    quickTranslate
  })

  // 应用开机自启设置
  applyAutoStartSetting()

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
  // 使用 setWindowOpenHandler 替代已废弃的 'new-window' 事件
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
})
