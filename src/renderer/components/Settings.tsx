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
  CircleX
} from 'lucide-react'
import { UserSettings, defaultSettings, SUPPORTED_LANGUAGES, TONE_STYLES } from '@shared/types/index.js'
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
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showGroqKey, setShowGroqKey] = useState(false)
  const [showDeepseekKey, setShowDeepseekKey] = useState(false)
  const [showQwenKey, setShowQwenKey] = useState(false)
  const [activeTab, setActiveTab] = useState<'api' | 'shortcuts' | 'personalization' | 'other'>('api')

  // 加载设置
  useEffect(() => {
    loadSettings()
  }, [])

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

  // 检查是否有更改
  useEffect(() => {
    const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings)
    setHasChanges(changed)
  }, [settings, originalSettings])

  // 显示消息
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // 保存设置
  const handleSave = async () => {
    setSaving(true)
    try {
      await window.electronAPI.setSettings(settings)
      setOriginalSettings(settings)
      showMessage('success', '设置已保存')
    } catch (error) {
      console.error('保存设置失败:', error)
      showMessage('error', '保存设置失败')
    } finally {
      setSaving(false)
    }
  }

  // 重置设置
  const handleReset = () => {
    if (window.confirm('确定要重置所有设置吗？')) {
      setSettings(defaultSettings)
    }
  }

  // 更新设置字段
  const updateSetting = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
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
    const item = window.prompt('请输入专有名词或术语:')
    if (item && item.trim()) {
      setSettings(prev => ({
        ...prev,
        personalDictionary: [...prev.personalDictionary, item.trim()]
      }))
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
  const testApiKey = async (type: 'groq' | 'deepseek') => {
    showMessage('success', '正在测试...')
    // 实际测试逻辑需要在主进程中实现
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
          {hasChanges && (
            <span className="unsaved-indicator">有未保存的更改</span>
          )}
          <button
            className="btn btn-secondary"
            onClick={handleReset}
            disabled={saving}
          >
            <RotateCcw className="btn-icon" />
            重置
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <>
                <div className="spinner" />
                保存中...
              </>
            ) : (
              <>
                <Save className="btn-icon" />
                保存
              </>
            )}
          </button>
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
              配置 Groq 和 DeepSeek 的 API Key 以使用语音识别和 AI 处理功能
            </p>

            {/* Groq API Key */}
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
                用于语音识别，<a href="https://console.groq.com" target="_blank" rel="noopener">获取 API Key</a>
              </span>
            </div>

            {/* DeepSeek API Key */}
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
                用于 AI 文本处理，<a href="https://platform.deepseek.com" target="_blank" rel="noopener">获取 API Key</a>
              </span>
            </div>

            {/* 千问 API Key */}
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
                  onClick={() => {
                    showMessage('success', '测试功能开发中')
                  }}
                >
                  测试
                </button>
              </div>
              <span className="help-text">
                用于 AI 文本处理（阿里云通义千问），<a href="https://dashscope.aliyun.com" target="_blank" rel="noopener">获取 API Key</a>
              </span>
            </div>

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
              <div className="form-group">
                <label>
                  <Volume2 className="label-icon" />
                  静音持续时间 (毫秒)
                </label>
                <input
                  type="number"
                  min="1000"
                  max="30000"
                  step="500"
                  value={settings.autoStopRecording.vadSilenceDuration}
                  onChange={e => updateSetting('autoStopRecording', { ...settings.autoStopRecording, vadSilenceDuration: parseInt(e.target.value) || 5000 })}
                />
                <span className="help-text">
                  检测到静音后，持续此时间将自动停止录音 (1000-30000 毫秒)
                </span>
              </div>
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
                <button className="add-btn" onClick={addDictionaryItem}>
                  + 添加词条
                </button>
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

            {/* 功能开关 */}
            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={settings.enableTranslation}
                  onChange={e => updateSetting('enableTranslation', e.target.checked)}
                />
                启用翻译功能
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Settings
