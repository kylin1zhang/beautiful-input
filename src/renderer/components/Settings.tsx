import React, { useState, useEffect } from 'react'
import {
  Key,
  Keyboard,
  Palette,
  Book,
  Settings2,
  Save,
  RotateCcw,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Globe,
  Volume2,
  CircleX,
  Clock
} from 'lucide-react'
import { UserSettings, defaultSettings, SUPPORTED_LANGUAGES, TONE_STYLES, LocalModelInfo, HardwareInfo, LocalModelType } from '@shared/types/index.js'
import './Settings.css'

// 快捷键录制组件
interface ShortcutRecorderProps {
  label: string
  icon: string
  value: string
  onChange: (value: string) => void
  // 新增：当前所有快捷键配置，用于互斥验证
  allShortcuts: UserSettings['shortcuts']
  currentKey: keyof UserSettings['shortcuts']
}

const ShortcutRecorder: React.FC<ShortcutRecorderProps> = ({
  label,
  icon,
  value,
  onChange,
  allShortcuts,
  currentKey
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [recordedShortcut, setRecordedShortcut] = useState(value)
  const [currentKeys, setCurrentKeys] = useState<string[]>([])
  const [conflictError, setConflictError] = useState<string | null>(null)

  // 按键名到 Electron 格式的映射
  const keyToElectronFormat = (key: string): string => {
    const keyMap: { [key: string]: string } = {
      'Control': 'CommandOrControl',
      'Ctrl': 'CommandOrControl',
      'Meta': 'CommandOrControl',
      'Command': 'CommandOrControl',
      'Alt': 'Alt',
      'Shift': 'Shift',
      'Super': 'Super'
    }
    return keyMap[key] || key
  }

  const startRecording = () => {
    setIsRecording(true)
    setCurrentKeys([])
    setConflictError(null)
  }

  const stopRecording = () => {
    setIsRecording(false)
    setCurrentKeys([])
    setConflictError(null)
  }

  // 检查快捷键冲突
  const checkConflict = (shortcut: string): boolean => {
    if (!shortcut) return false

    for (const [key, value] of Object.entries(allShortcuts)) {
      if (key !== currentKey && value === shortcut) {
        // 获取冲突功能的名称
        const conflictNames: { [key: string]: string } = {
          'toggleRecording': '开始/停止录音',
          'quickTranslate': '快速翻译'
        }
        setConflictError(`该快捷键已被"${conflictNames[key]}"使用`)
        return true
      }
    }
    setConflictError(null)
    return false
  }

  // 处理键盘事件
  useEffect(() => {
    if (!isRecording) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // ESC 键取消录制
      if (e.key === 'Escape') {
        stopRecording()
        return
      }

      const keys: string[] = []

      // 添加修饰键
      if (e.ctrlKey) keys.push('CommandOrControl')
      if (e.altKey) keys.push('Alt')
      if (e.shiftKey) keys.push('Shift')
      if (e.metaKey) keys.push('CommandOrControl')

      // 添加主键（排除修饰键）
      const mainKey = e.key
      if (
        !['Control', 'Alt', 'Shift', 'Meta', 'Escape'].includes(mainKey) &&
        mainKey !== 'Process'
      ) {
        // 转换特殊键名
        let electronKey = mainKey
        if (mainKey === ' ') electronKey = 'Space'
        else if (mainKey.startsWith('Arrow')) electronKey = mainKey.replace('Arrow', '')
        else if (mainKey.length === 1) {
          electronKey = mainKey.toUpperCase()
        }

        keys.push(electronKey)

        // 格式化为 Electron 快捷键字符串
        const shortcut = keys.join('+')

        // 检查冲突
        if (!checkConflict(shortcut)) {
          setRecordedShortcut(shortcut)
          onChange(shortcut)
        }
        setIsRecording(false)
        setCurrentKeys([])
      } else {
        // 只按下修饰键时，显示当前按下的键
        setCurrentKeys(keys)
      }
    }

    // 监听键盘事件
    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, allShortcuts])

  // 获取显示的快捷键格式
  const getDisplayShortcut = (shortcut: string) => {
    if (!shortcut) return ''
    const isMac = typeof process !== 'undefined' && process.platform === 'darwin'
    return shortcut
      .replace(/CommandOrControl/g, isMac ? 'Cmd' : 'Ctrl')
      .replace(/\+/g, ' + ')
  }

  // 图标组件
  const IconComponent = icon === 'Keyboard' ? Keyboard : icon === 'Globe' ? Globe : Volume2

  return (
    <div className="form-group">
      <label>
        <IconComponent className="label-icon" />
        {label}
      </label>
      <div className="shortcut-input-group">
        <input
          type="text"
          value={isRecording ? (currentKeys.length > 0 ? currentKeys.join(' + ') + ' + ...' : '请按下快捷键组合...') : recordedShortcut}
          onChange={(e) => {
            if (!isRecording) {
              setRecordedShortcut(e.target.value)
              onChange(e.target.value)
              // 清除冲突错误（手动输入时）
              setConflictError(null)
            }
          }}
          placeholder={isRecording ? '请按下快捷键组合...' : '点击录制按钮，然后按快捷键'}
          readOnly={isRecording}
          className={isRecording ? 'recording' : ''}
        />
        <button
          className={`input-action record-btn ${isRecording ? 'recording' : ''}`}
          onClick={isRecording ? stopRecording : startRecording}
          title={isRecording ? '取消录制' : '录制快捷键'}
        >
          {isRecording ? <CircleX /> : <Keyboard />}
        </button>
      </div>
      {/* 冲突错误提示 */}
      {conflictError && (
        <span className="help-text error-text">
          <AlertCircle style={{ display: 'inline', width: '14px', height: '14px', marginRight: '4px' }} />
          {conflictError}
        </span>
      )}
      {!isRecording && value && !conflictError && (
        <span className="help-text">
          当前快捷键: <kbd>{getDisplayShortcut(value)}</kbd>
        </span>
      )}
      {isRecording && (
        <span className="help-text recording-hint">
          按 ESC 键取消录制
        </span>
      )}
    </div>
  )
}

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings)
  const [originalSettings, setOriginalSettings] = useState<UserSettings>(defaultSettings)
  const [hasChanges, setHasChanges] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showOpenaiKey, setShowOpenaiKey] = useState(false)
  const [showDeepseekKey, setShowDeepseekKey] = useState(false)
  const [showQwenKey, setShowQwenKey] = useState(false)
  const [activeTab, setActiveTab] = useState<'api' | 'shortcuts' | 'personalization' | 'other'>('api')
  const [newDictionaryItem, setNewDictionaryItem] = useState('')
  const [localModels, setLocalModels] = useState<LocalModelInfo[]>([])
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null)
  const [downloadingModel, setDownloadingModel] = useState<LocalModelType | null>(null)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [whisperInstalled, setWhisperInstalled] = useState<boolean | null>(null)
  const [whisperInstalling, setWhisperInstalling] = useState(false)

  // 自动保存定时器引用
  const autoSaveTimerRef = React.useRef<NodeJS.Timeout | null>(null)

  // API Key 暂存（失去焦点时才保存）
  const [pendingApiKeySave, setPendingApiKeySave] = useState(false)

  // 加载设置
  useEffect(() => {
    loadSettings()
    loadLocalModels()
    loadHardwareInfo()
    checkWhisperStatus()

    // 监听模型下载进度
    window.electronAPI.onModelDownloadProgress((_, data) => {
      if (data.status === 'downloading') {
        setDownloadProgress(data.progress || 0)
      } else if (data.status === 'completed') {
        setDownloadingModel(null)
        setDownloadProgress(0)
        loadLocalModels()
      } else if (data.status === 'error') {
        setDownloadingModel(null)
        setDownloadProgress(0)
        showMessage('error', data.error || '下载失败')
      }
    })
  }, [])

  // 检查 Whisper 状态
  const checkWhisperStatus = async () => {
    try {
      const installed = await window.electronAPI.checkWhisper()
      setWhisperInstalled(installed)
    } catch (error) {
      console.error('检查 Whisper 状态失败:', error)
      setWhisperInstalled(false)
    }
  }

  // 安装 Whisper（从本地资源）
  const handleInstallWhisper = async () => {
    setWhisperInstalling(true)
    try {
      const success = await window.electronAPI.installWhisper()
      if (success) {
        setWhisperInstalled(true)
        showMessage('success', 'Whisper 安装成功')
      } else {
        showMessage('error', 'Whisper 安装失败，请检查资源文件是否存在')
      }
    } catch (error) {
      showMessage('error', `安装失败: ${(error as Error).message}`)
    } finally {
      setWhisperInstalling(false)
    }
  }

  const loadSettings = async () => {
    try {
      const loaded = await window.electronAPI.getSettings()
      setSettings(loaded)
      setOriginalSettings(loaded)
    } catch (error) {
      console.error('加载设置失败:', error)
      showMessage('error', '加载设置失败')
    }
  }

  // 加载本地模型信息
  const loadLocalModels = async () => {
    try {
      const models = await window.electronAPI.getLocalModels()
      setLocalModels(models)
    } catch (error) {
      console.error('加载模型信息失败:', error)
    }
  }

  // 加载硬件信息
  const loadHardwareInfo = async () => {
    try {
      const info = await window.electronAPI.getHardwareInfo()
      if (info) {
        setHardwareInfo(info)
        // 不再自动覆盖用户选择的模型
        // 硬件信息仅用于显示推荐，用户可以自行选择
      }
    } catch (error) {
      console.error('加载硬件信息失败:', error)
    }
  }

  // 检测硬件
  const detectHardware = async () => {
    showMessage('success', '正在检测硬件...')
    try {
      const info = await window.electronAPI.detectHardware()
      setHardwareInfo(info)
      // 自动选择推荐模型
      updateSetting('localModel', {
        ...settings.localModel,
        selectedModel: info.recommendedModel
      })
      showMessage('success', `硬件检测完成，推荐使用 ${info.recommendedModel} 模型`)
    } catch (error) {
      showMessage('error', '硬件检测失败')
    }
  }

  // 下载模型
  const handleDownloadModel = async (modelType: LocalModelType) => {
    setDownloadingModel(modelType)
    setDownloadProgress(0)

    try {
      await window.electronAPI.downloadModel(modelType)
      // 下载完成后刷新模型列表（通过进度回调处理）
    } catch (error) {
      showMessage('error', `下载失败: ${(error as Error).message}`)
      setDownloadingModel(null)
      setDownloadProgress(0)
    }
  }

  // 取消下载
  const handleCancelDownload = (modelType: LocalModelType) => {
    window.electronAPI.cancelDownload(modelType)
    setDownloadingModel(null)
    setDownloadProgress(0)
  }

  // 删除模型
  const handleDeleteModel = async (modelType: LocalModelType) => {
    if (!window.confirm('确定要删除此模型吗？')) return

    try {
      await window.electronAPI.deleteModel(modelType)
      await loadLocalModels()
      showMessage('success', '模型已删除')
    } catch (error) {
      showMessage('error', '删除失败')
    }
  }

  // 检查是否有更改（区分 API Key 和其他配置）
  useEffect(() => {
    const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings)
    setHasChanges(changed)

    // 只对非 API Key 配置进行自动保存
    if (changed && !pendingApiKeySave) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
      autoSaveTimerRef.current = setTimeout(() => {
        autoSave()
      }, 1000)
    } else if (!changed) {
      // 无更改时显示"已保存"状态
      setSaveStatus('saved')
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [settings, originalSettings, pendingApiKeySave])

  // 自动保存函数
  const autoSave = async () => {
    setSaveStatus('saving')
    try {
      await window.electronAPI.setSettings(settings)
      setOriginalSettings(settings)
      setHasChanges(false)
      setPendingApiKeySave(false)
      setSaveStatus('saved')
      // 2 秒后恢复 idle 状态
      setTimeout(() => {
        if (!hasChanges && !pendingApiKeySave) {
          setSaveStatus('idle')
        }
      }, 2000)
    } catch (error) {
      console.error('自动保存失败:', error)
      setSaveStatus('idle')
      showMessage('error', '保存失败')
    }
  }

  // 显示消息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // 判断是否为 API Key 配置项
  const isApiKeySetting = (key: keyof UserSettings): boolean => {
    return ['groqApiKey', 'openaiApiKey', 'deepseekApiKey', 'qwenApiKey'].includes(key)
  }

  // 获取 API Key 的友好名称
  const getApiKeyDisplayName = (key: string): string => {
    const names: Record<string, string> = {
      'groqApiKey': 'Groq',
      'openaiApiKey': 'OpenAI',
      'deepseekApiKey': 'DeepSeek',
      'qwenApiKey': '千问'
    }
    return names[key] || key
  }

  // 验证 API Key 格式
  const validateApiKey = (key: string, value: string): boolean => {
    if (!value) return true // 空值允许（用户可以清空）
    // 简单验证：至少 20 个字符，且以特定前缀开头
    if (key === 'groqApiKey') {
      return value.length >= 20 && value.startsWith('gsk_')
    }
    if (key === 'openaiApiKey') {
      return value.length >= 20 && value.startsWith('sk-')
    }
    if (key === 'deepseekApiKey' || key === 'qwenApiKey') {
      return value.length >= 20 && (value.startsWith('sk-') || value.startsWith('sess-'))
    }
    return true
  }

  // 处理 API Key 失去焦点
  const handleApiKeyBlur = (key: keyof UserSettings, value: string) => {
    setPendingApiKeySave(false)

    // 验证格式
    if (value && !validateApiKey(key, value)) {
      const displayName = getApiKeyDisplayName(key)
      showMessage('error', `${displayName} API Key 格式不正确，已恢复原值`)
      // 验证失败，恢复到原始值
      setSettings(prev => ({ ...prev, [key]: originalSettings[key] }))
      return
    }

    // 验证通过，保存 API Key
    autoSave()
  }

  // 手动保存（用户点击按钮）
  const handleSave = async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    autoSave()
  }

  // 更新设置字段
  const updateSetting = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))

    // 如果是 API Key，标记为待保存
    if (isApiKeySetting(key)) {
      setPendingApiKeySave(true)
    }
  }

  // 重置设置
  const handleReset = () => {
    if (window.confirm('确定要重置所有设置吗？')) {
      setSettings(defaultSettings)
    }
  }

  // 打开历史记录窗口
  const handleShowHistory = () => {
    window.electronAPI.showHistory()
  }

  // 更新快捷键
  const updateShortcut = (
    key: keyof UserSettings['shortcuts'],
    value: string
  ) => {
    setSettings(prev => ({
      ...prev,
      shortcuts: { ...prev.shortcuts, [key]: value }
    }))
  }

  // 添加个人词典词条
  const addDictionaryItem = () => {
    if (newDictionaryItem.trim()) {
      setSettings(prev => ({
        ...prev,
        personalDictionary: [...prev.personalDictionary, newDictionaryItem.trim()]
      }))
      setNewDictionaryItem('')
    }
  }

  // 处理回车键添加词条
  const handleDictionaryKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      addDictionaryItem()
    }
  }

  // 删除个人词典词条
  const removeDictionaryItem = (index: number) => {
    setSettings(prev => ({
      ...prev,
      personalDictionary: prev.personalDictionary.filter((_, i) => i !== index)
    }))
  }

  // 测试 API Key
  const testApiKey = async (type: 'groq' | 'openai' | 'deepseek' | 'qwen') => {
    showMessage('success', '正在测试连接...')

    try {
      let result: { success: boolean; message: string }

      if (type === 'groq') {
        // 测试 Groq API
        const apiKey = settings.groqApiKey
        if (!apiKey) {
          showMessage('error', '请先输入 API Key')
          return
        }
        // 调用测试接口（使用轻量级的模型列表接口）
        const response = await fetch('https://api.groq.com/openai/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        })
        if (response.ok) {
          showMessage('success', 'Groq API Key 验证成功！')
        } else {
          showMessage('error', `API Key 无效 (${response.status})`)
        }
      } else if (type === 'openai') {
        // 测试 OpenAI API
        const apiKey = settings.openaiApiKey
        if (!apiKey) {
          showMessage('error', '请先输入 API Key')
          return
        }
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        })
        if (response.ok) {
          showMessage('success', 'OpenAI API Key 验证成功！')
        } else {
          const data = await response.json()
          showMessage('error', `API Key 无效: ${data.error?.message || response.statusText}`)
        }
      } else if (type === 'deepseek') {
        // 测试 DeepSeek API
        const apiKey = settings.deepseekApiKey
        if (!apiKey) {
          showMessage('error', '请先输入 API Key')
          return
        }
        const response = await fetch('https://api.deepseek.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        })
        if (response.ok) {
          showMessage('success', 'DeepSeek API Key 验证成功！')
        } else {
          const data = await response.json()
          showMessage('error', `API Key 无效: ${data.error?.message || response.statusText}`)
        }
      } else if (type === 'qwen') {
        // 测试千问 API
        const apiKey = settings.qwenApiKey
        if (!apiKey) {
          showMessage('error', '请先输入 API Key')
          return
        }
        const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        })
        if (response.ok) {
          showMessage('success', '千问 API Key 验证成功！')
        } else {
          const data = await response.json()
          showMessage('error', `API Key 无效: ${data.error?.message || response.statusText}`)
        }
      }
    } catch (error) {
      showMessage('error', `网络错误: ${(error as Error).message}`)
    }
  }

  return (
    <div className="settings-container">
      {/* 标题栏 */}
      <div className="settings-header">
        <h1>
          <Settings2 className="header-icon" />
          BeautifulInput 设置
        </h1>
        <div className="header-actions">
          {saveStatus === 'saved' && (
            <span className="save-indicator">✓ 已自动保存</span>
          )}
          {saveStatus === 'saving' && (
            <span className="save-indicator saving">正在保存...</span>
          )}
          <button
            className="btn btn-secondary"
            onClick={handleShowHistory}
            title="查看历史记录"
          >
            <Clock className="btn-icon" />
            历史记录
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleReset}
            disabled={saving}
          >
            <RotateCcw className="btn-icon" />
            重置
          </button>
          {saveStatus === 'idle' && !hasChanges ? (
            <button className="btn btn-primary" disabled>
              <Check className="btn-icon" />
              已保存
            </button>
          ) : saveStatus === 'saving' ? (
            <button className="btn btn-primary" disabled>
              <div className="spinner" />
              保存中...
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={handleSave}
            >
              {hasChanges ? (
                <>
                  <Save className="btn-icon" />
                  立即保存
                </>
              ) : (
                <>
                  <Check className="btn-icon" />
                  已保存
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`message ${message.type}`}>
          {message.type === 'success' ? (
            <Check className="message-icon" />
          ) : (
            <AlertCircle className="message-icon" />
          )}
          {message.text}
        </div>
      )}

      {/* 标签页 */}
      <div className="settings-tabs">
        <button
          className={`tab ${activeTab === 'api' ? 'active' : ''}`}
          onClick={() => setActiveTab('api')}
        >
          <Key className="tab-icon" />
          API 配置
        </button>
        <button
          className={`tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
          onClick={() => setActiveTab('shortcuts')}
        >
          <Keyboard className="tab-icon" />
          快捷键
        </button>
        <button
          className={`tab ${activeTab === 'personalization' ? 'active' : ''}`}
          onClick={() => setActiveTab('personalization')}
        >
          <Palette className="tab-icon" />
          个性化
        </button>
        <button
          className={`tab ${activeTab === 'other' ? 'active' : ''}`}
          onClick={() => setActiveTab('other')}
        >
          <Settings2 className="tab-icon" />
          其他
        </button>
      </div>

      {/* 内容区域 */}
      <div className="settings-content">
        {/* API 配置 */}
        {activeTab === 'api' && (
          <div className="settings-section">
            <h2>API 配置</h2>
            <p className="section-description">
              配置语音识别和 AI 处理服务的 API Key。所有数据均经过加密存储，仅用于与各服务提供商的 API 通信。
            </p>

            {/* 语音识别服务模块 */}
            <div className="api-module">
              <h3 className="module-title">
                <Volume2 className="module-icon" />
                语音识别服务
              </h3>
              <p className="module-description">
                用于将语音转换为文本，支持多种识别引擎
              </p>

              {/* 语音服务提供商选择 */}
              <div className="form-group">
                <label>
                  <Key className="label-icon" />
                  语音服务提供商
                </label>
                <select
                  value={settings.asrProvider}
                  onChange={e => updateSetting('asrProvider', e.target.value as 'groq' | 'openai' | 'local')}
                >
                  <option value="groq">Groq (Whisper Large V3)</option>
                  <option value="openai">OpenAI (Whisper)</option>
                  <option value="local">本地模型 (离线)</option>
                </select>
                <span className="help-text">
                  选择用于语音识别的服务提供商
                </span>
              </div>

              {/* Groq API Key */}
              {settings.asrProvider === 'groq' && (
                <div className="form-group">
                  <label>
                    <Key className="label-icon" />
                    Groq API Key
                    <span className="required">*</span>
                  </label>
                  <div className="input-group">
                    <input
                      type={showGroqKey ? 'text' : 'password'}
                      value={settings.groqApiKey}
                      onChange={e => updateSetting('groqApiKey', e.target.value)}
                      onBlur={() => handleApiKeyBlur('groqApiKey', settings.groqApiKey)}
                      placeholder="输入 Groq API Key"
                    />
                    <button
                      className="input-action"
                      onClick={() => setShowGroqKey(!showGroqKey)}
                    >
                      {showGroqKey ? <EyeOff /> : <Eye />}
                    </button>
                    <button
                      className="input-action test-btn"
                      onClick={() => testApiKey('groq')}
                    >
                      测试
                    </button>
                  </div>
                  <span className="help-text">
                    使用 Groq Whisper Large V3 模型进行语音识别，<a href="https://console.groq.com" target="_blank" rel="noreferrer">获取 API Key</a>
                  </span>
                </div>
              )}

              {/* OpenAI API Key */}
              {settings.asrProvider === 'openai' && (
                <div className="form-group">
                  <label>
                    <Key className="label-icon" />
                    OpenAI API Key
                    <span className="required">*</span>
                  </label>
                  <div className="input-group">
                    <input
                      type={showOpenaiKey ? 'text' : 'password'}
                      value={settings.openaiApiKey}
                      onChange={e => updateSetting('openaiApiKey', e.target.value)}
                      onBlur={() => handleApiKeyBlur('openaiApiKey', settings.openaiApiKey)}
                      placeholder="输入 OpenAI API Key"
                    />
                    <button
                      className="input-action"
                      onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    >
                      {showOpenaiKey ? <EyeOff /> : <Eye />}
                    </button>
                    <button
                      className="input-action test-btn"
                      onClick={() => testApiKey('openai')}
                    >
                      测试
                    </button>
                  </div>
                  <span className="help-text">
                    使用 OpenAI Whisper 模型进行语音识别，<a href="https://platform.openai.com" target="_blank" rel="noreferrer">获取 API Key</a>
                  </span>
                </div>
              )}

              {/* 本地模型配置 */}
              {settings.asrProvider === 'local' && (
                <div className="local-model-section">
                  <h4>本地模型设置</h4>

                  {/* Whisper 程序状态 */}
                  <div className="form-group">
                    <label>Whisper 程序</label>
                    <div className="whisper-status">
                      {whisperInstalled === null ? (
                        <p className="status-checking">正在检查...</p>
                      ) : whisperInstalled ? (
                        <p className="status-installed">
                          <span className="status-icon">✓</span>
                          Whisper 已安装，可以使用本地语音识别
                        </p>
                      ) : (
                        <div>
                          <p className="status-not-installed">
                            <span className="status-icon">!</span>
                            Whisper 未安装
                          </p>
                          <button
                            className="btn btn-primary"
                            onClick={handleInstallWhisper}
                            disabled={whisperInstalling}
                            style={{ marginTop: '8px' }}
                          >
                            {whisperInstalling ? '正在安装...' : '安装 Whisper'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 硬件检测 */}
                  <div className="form-group">
                    <label>硬件检测</label>
                    <div className="hardware-info">
                      {hardwareInfo ? (
                        <>
                          <p>
                            <strong>检测结果：</strong>
                            {hardwareInfo.hasNvidia && hardwareInfo.nvidiaGpuName
                              ? `${hardwareInfo.nvidiaGpuName} (${hardwareInfo.vram}MB)`
                              : hardwareInfo.isAppleSilicon
                                ? 'Apple Silicon'
                                : '仅 CPU'}
                          </p>
                          <p>
                            <strong>推荐模型：</strong>
                            {hardwareInfo.recommendedModel}
                            <span className="recommend-reason">({hardwareInfo.recommendedReason})</span>
                          </p>
                        </>
                      ) : (
                        <p>尚未检测硬件</p>
                      )}
                      <button className="btn btn-secondary" onClick={detectHardware}>
                        重新检测
                      </button>
                    </div>
                  </div>

                  {/* 模型列表 */}
                  <div className="form-group">
                    <label>模型选择</label>
                    <div className="model-list">
                      {localModels.map(model => (
                        <div key={model.type} className="model-item">
                          <label className="model-radio">
                            <input
                              type="radio"
                              name="localModel"
                              value={model.type}
                              checked={settings.localModel?.selectedModel === model.type}
                              onChange={() => updateSetting('localModel', {
                                ...settings.localModel,
                                selectedModel: model.type
                              })}
                              disabled={!model.downloaded}
                            />
                            <span className="model-name">{model.name}</span>
                            <span className="model-size">{model.sizeDisplay}</span>
                            {model.downloaded && <span className="model-status downloaded">✓ 已下载</span>}
                          </label>
                          <div className="model-actions">
                            {!model.downloaded && (
                              <>
                                {downloadingModel === model.type ? (
                                  <div className="download-progress">
                                    <div className="progress-bar">
                                      <div
                                        className="progress-fill"
                                        style={{ width: `${downloadProgress}%` }}
                                      />
                                    </div>
                                    <span>{downloadProgress}%</span>
                                    <button
                                      className="btn btn-small btn-danger"
                                      onClick={() => handleCancelDownload(model.type)}
                                    >
                                      取消
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    className="btn btn-small"
                                    onClick={() => handleDownloadModel(model.type)}
                                  >
                                    下载
                                  </button>
                                )}
                              </>
                            )}
                            {model.downloaded && (
                              <button
                                className="btn btn-small btn-danger"
                                onClick={() => handleDeleteModel(model.type)}
                              >
                                删除
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 语言设置 */}
                  <div className="form-group">
                    <label>语言</label>
                    <select
                      value={settings.localModel?.language || 'auto'}
                      onChange={e => updateSetting('localModel', {
                        ...settings.localModel,
                        language: e.target.value
                      })}
                    >
                      <option value="auto">自动检测</option>
                      <option value="zh">中文</option>
                      <option value="en">英语</option>
                      <option value="ja">日语</option>
                      <option value="ko">韩语</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* AI 处理服务模块 */}
            <div className="api-module">
              <h3 className="module-title">
                <Palette className="module-icon" />
                AI 处理服务
              </h3>
              <p className="module-description">
                用于文本清理、格式化、翻译等 AI 处理功能
              </p>

              {/* AI 服务提供商选择 */}
              <div className="form-group">
                <label>
                  <Key className="label-icon" />
                  AI 服务提供商
                </label>
                <select
                  value={settings.aiProvider}
                  onChange={e => updateSetting('aiProvider', e.target.value as 'deepseek' | 'qwen')}
                >
                  <option value="deepseek">DeepSeek</option>
                  <option value="qwen">千问 (通义千问)</option>
                </select>
                <span className="help-text">
                  选择用于 AI 文本处理的服务提供商
                </span>
              </div>

              {/* DeepSeek API Key */}
              {settings.aiProvider === 'deepseek' && (
                <div className="form-group">
                  <label>
                    <Key className="label-icon" />
                    DeepSeek API Key
                    <span className="required">*</span>
                  </label>
                  <div className="input-group">
                    <input
                      type={showDeepseekKey ? 'text' : 'password'}
                      value={settings.deepseekApiKey}
                      onChange={e => updateSetting('deepseekApiKey', e.target.value)}
                      onBlur={() => handleApiKeyBlur('deepseekApiKey', settings.deepseekApiKey)}
                      placeholder="输入 DeepSeek API Key"
                    />
                    <button
                      className="input-action"
                      onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                    >
                      {showDeepseekKey ? <EyeOff /> : <Eye />}
                    </button>
                    <button
                      className="input-action test-btn"
                      onClick={() => testApiKey('deepseek')}
                    >
                      测试
                    </button>
                  </div>
                  <span className="help-text">
                    用于 AI 文本处理，<a href="https://platform.deepseek.com" target="_blank" rel="noreferrer">获取 API Key</a>
                  </span>
                </div>
              )}

              {/* 千问 API Key */}
              {settings.aiProvider === 'qwen' && (
                <div className="form-group">
                  <label>
                    <Key className="label-icon" />
                    千问 API Key
                    <span className="required">*</span>
                  </label>
                  <div className="input-group">
                    <input
                      type={showQwenKey ? 'text' : 'password'}
                      value={settings.qwenApiKey}
                      onChange={e => updateSetting('qwenApiKey', e.target.value)}
                      onBlur={() => handleApiKeyBlur('qwenApiKey', settings.qwenApiKey)}
                      placeholder="输入千问 API Key"
                    />
                    <button
                      className="input-action"
                      onClick={() => setShowQwenKey(!showQwenKey)}
                    >
                      {showQwenKey ? <EyeOff /> : <Eye />}
                    </button>
                    <button
                      className="input-action test-btn"
                      onClick={() => testApiKey('qwen')}
                    >
                      测试
                    </button>
                  </div>
                  <span className="help-text">
                    阿里云通义千问 API Key，<a href="https://dashscope.aliyun.com" target="_blank" rel="noreferrer">获取 API Key</a>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 快捷键设置 */}
        {activeTab === 'shortcuts' && (
          <div className="settings-section">
            <h2>快捷键设置</h2>
            <p className="section-description">
              点击录制按钮后，直接按下键盘组合键即可设置。每个快捷键必须唯一，不能重复。
            </p>

            <ShortcutRecorder
              label="开始/停止录音"
              icon="Keyboard"
              value={settings.shortcuts.toggleRecording}
              onChange={(value) => updateShortcut('toggleRecording', value)}
              allShortcuts={settings.shortcuts}
              currentKey="toggleRecording"
            />

            <ShortcutRecorder
              label="快速翻译"
              icon="Globe"
              value={settings.shortcuts.quickTranslate}
              onChange={(value) => updateShortcut('quickTranslate', value)}
              allShortcuts={settings.shortcuts}
              currentKey="quickTranslate"
            />
          </div>
        )}

        {/* 个性化设置 */}
        {activeTab === 'personalization' && (
          <div className="settings-section">
            <h2>个性化设置</h2>

            {/* 自动停止录音 */}
            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={settings.autoStopRecording.enabled}
                  onChange={e => updateSetting('autoStopRecording', { ...settings.autoStopRecording, enabled: e.target.checked })}
                />
                启用自动停止录音（静音检测）
              </label>
              <span className="help-text">
                检测到静音时自动停止录音
              </span>
            </div>

            {/* 静音持续时间设置 */}
            {settings.autoStopRecording.enabled && (
              <>
                <div className="form-group">
                  <label>
                    <Volume2 className="label-icon" />
                    静音持续时间 (秒)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    step="0.5"
                    value={settings.autoStopRecording.vadSilenceDuration / 1000}
                    onChange={e => updateSetting('autoStopRecording', {
                      ...settings.autoStopRecording,
                      vadSilenceDuration: Math.round((parseFloat(e.target.value) || 3.5) * 1000)
                    })}
                  />
                  <span className="help-text">
                    检测到静音后，持续此时间将自动停止录音（1-30 秒，默认 3.5 秒）
                  </span>
                </div>

                {/* 静音检测灵敏度 */}
                <div className="form-group">
                  <label>
                    <Volume2 className="label-icon" />
                    静音检测灵敏度
                  </label>
                  <div className="range-group">
                    <input
                      type="range"
                      min="0.005"
                      max="0.03"
                      step="0.001"
                      value={settings.autoStopRecording.vadSilenceThreshold ?? 0.008}
                      onChange={e => updateSetting('autoStopRecording', {
                        ...settings.autoStopRecording,
                        vadSilenceThreshold: parseFloat(e.target.value)
                      })}
                    />
                    <span>{settings.autoStopRecording.vadSilenceThreshold ?? 0.008}</span>
                  </div>
                  <span className="help-text">
                    数值越小越灵敏，但可能误判环境噪音。建议范围：0.006-0.025，当前默认：0.008
                  </span>
                </div>
              </>
            )}

            {/* 语调风格 */}
            <div className="form-group">
              <label>
                <Palette className="label-icon" />
                语调风格
              </label>
              <select
                value={settings.toneStyle}
                onChange={e => updateSetting('toneStyle', e.target.value as UserSettings['toneStyle'])}
              >
                {TONE_STYLES.map(style => (
                  <option key={style.value} value={style.value}>
                    {style.label} - {style.description}
                  </option>
                ))}
              </select>
            </div>

            {/* 默认语言 */}
            <div className="form-group">
              <label>
                <Globe className="label-icon" />
                默认语言
              </label>
              <select
                value={settings.defaultLanguage}
                onChange={e => updateSetting('defaultLanguage', e.target.value)}
              >
                {SUPPORTED_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 个人词典 */}
            <div className="form-group">
              <label>
                <Book className="label-icon" />
                个人词典
              </label>
              <div className="dictionary-list">
                {settings.personalDictionary.map((item, index) => (
                  <div key={index} className="dictionary-item">
                    <span>{item}</span>
                    <button
                      className="remove-btn"
                      onClick={() => removeDictionaryItem(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="dictionary-input-group">
                  <input
                    type="text"
                    value={newDictionaryItem}
                    onChange={(e) => setNewDictionaryItem(e.target.value)}
                    onKeyPress={handleDictionaryKeyPress}
                    placeholder="输入专有名词或术语"
                    className="dictionary-input"
                  />
                  <button
                    className="add-dict-btn"
                    onClick={addDictionaryItem}
                    disabled={!newDictionaryItem.trim()}
                  >
                    添加
                  </button>
                </div>
              </div>
              <span className="help-text">
                添加专有名词和术语，提高语音识别准确率
              </span>
            </div>
          </div>
        )}

        {/* 其他设置 */}
        {activeTab === 'other' && (
          <div className="settings-section">
            <h2>其他设置</h2>

            {/* 开机自启 */}
            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={settings.autoStart}
                  onChange={e => updateSetting('autoStart', e.target.checked)}
                />
                开机自启
              </label>
              <span className="help-text">
                系统启动时自动运行 BeautifulInput
              </span>
            </div>

            {/* 悬浮球透明度 */}
            <div className="form-group">
              <label>悬浮球透明度</label>
              <div className="range-group">
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.1"
                  value={settings.floatOpacity}
                  onChange={e => updateSetting('floatOpacity', parseFloat(e.target.value))}
                />
                <span>{Math.round(settings.floatOpacity * 100)}%</span>
              </div>
            </div>

            {/* 历史记录保留天数 */}
            <div className="form-group">
              <label>历史记录保留天数</label>
              <input
                type="number"
                min="1"
                max="365"
                value={settings.historyRetentionDays}
                onChange={e => updateSetting('historyRetentionDays', parseInt(e.target.value))}
              />
              <span className="help-text">
                超过此天数的历史记录将自动删除
              </span>
            </div>

            {/* 语音翻译设置 */}
            <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '20px', marginTop: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '16px', color: '#1a1a1a' }}>
                语音翻译设置
              </h3>

              {/* 翻译源语言 */}
              <div className="form-group">
                <label>
                  <Globe className="label-icon" />
                  翻译源语言
                </label>
                <select
                  value={settings.translateSourceLanguage || 'zh-CN'}
                  onChange={e => updateSetting('translateSourceLanguage', e.target.value)}
                >
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
                <span className="help-text">
                  语音翻译时，识别的源语言
                </span>
              </div>

              {/* 翻译目标语言 */}
              <div className="form-group">
                <label>
                  <Globe className="label-icon" />
                  翻译目标语言
                </label>
                <select
                  value={settings.translateTargetLanguage || 'en'}
                  onChange={e => updateSetting('translateTargetLanguage', e.target.value)}
                >
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
                <span className="help-text">
                  语音翻译时，翻译成的目标语言
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Settings
