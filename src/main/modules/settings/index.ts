import { EventEmitter } from 'events'
import { UserSettings, defaultSettings } from '@shared/types/index.js'
import { StoreService } from '../../services/store.service.js'

export class SettingsModule extends EventEmitter {
  private store: StoreService
  private settings: UserSettings

  constructor(store: StoreService) {
    super()
    this.store = store
    this.settings = this.loadSettings()
  }

  /**
   * 加载设置
   */
  private loadSettings(): UserSettings {
    const stored = this.store.getSettings()
    return {
      ...defaultSettings,
      ...stored
    }
  }

  /**
   * 获取当前设置
   */
  getSettings(): UserSettings {
    return { ...this.settings }
  }

  /**
   * 更新设置
   */
  setSettings(newSettings: Partial<UserSettings>): void {
    this.settings = {
      ...this.settings,
      ...newSettings
    }
    this.store.setSettings(this.settings)
    this.emit('settingsChanged', this.settings)
  }

  /**
   * 重置设置为默认值
   */
  resetSettings(): void {
    this.settings = { ...defaultSettings }
    this.store.setSettings(this.settings)
    this.emit('settingsChanged', this.settings)
  }

  /**
   * 获取 API Key（已脱敏）
   */
  getMaskedApiKeys(): { groq: string; deepseek: string } {
    return {
      groq: this.maskApiKey(this.settings.groqApiKey),
      deepseek: this.maskApiKey(this.settings.deepseekApiKey)
    }
  }

  /**
   * 脱敏 API Key
   */
  private maskApiKey(apiKey: string): string {
    if (!apiKey || apiKey.length < 8) {
      return ''
    }
    const firstFour = apiKey.slice(0, 4)
    const lastFour = apiKey.slice(-4)
    const masked = '*'.repeat(apiKey.length - 8)
    return `${firstFour}${masked}${lastFour}`
  }

  /**
   * 验证设置
   */
  validateSettings(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // 验证 API Keys
    if (!this.settings.groqApiKey) {
      errors.push('Groq API Key 未设置')
    } else if (!this.isValidApiKeyFormat(this.settings.groqApiKey)) {
      errors.push('Groq API Key 格式不正确')
    }

    if (!this.settings.deepseekApiKey) {
      errors.push('DeepSeek API Key 未设置')
    } else if (!this.isValidApiKeyFormat(this.settings.deepseekApiKey)) {
      errors.push('DeepSeek API Key 格式不正确')
    }

    // 验证快捷键
    for (const [key, shortcut] of Object.entries(this.settings.shortcuts)) {
      if (!this.isValidShortcut(shortcut)) {
        errors.push(`快捷键 ${key} 格式不正确`)
      }
    }

    // 验证透明度
    if (this.settings.floatOpacity < 0.1 || this.settings.floatOpacity > 1) {
      errors.push('悬浮球透明度必须在 0.1 到 1 之间')
    }

    // 验证历史记录保留天数
    if (this.settings.historyRetentionDays < 1 || this.settings.historyRetentionDays > 365) {
      errors.push('历史记录保留天数必须在 1 到 365 之间')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * 验证 API Key 格式
   */
  private isValidApiKeyFormat(apiKey: string): boolean {
    // 基本的 API Key 格式验证
    // Groq: gsk_...
    // DeepSeek: sk-...
    if (apiKey.startsWith('gsk_')) {
      return apiKey.length >= 20
    }
    if (apiKey.startsWith('sk-')) {
      return apiKey.length >= 20
    }
    return apiKey.length >= 20
  }

  /**
   * 验证快捷键格式
   */
  private isValidShortcut(shortcut: string): boolean {
    const parts = shortcut.split('+')
    if (parts.length < 2) return false

    const modifiers = ['Command', 'Control', 'Cmd', 'Ctrl', 'Alt', 'Option', 'Shift', 'Super']
    const hasModifier = parts.some(part => 
      modifiers.some(mod => part.toLowerCase().includes(mod.toLowerCase()))
    )
    const hasKey = parts.some(part => 
      !modifiers.some(mod => part.toLowerCase().includes(mod.toLowerCase()))
    )

    return hasModifier && hasKey
  }

  /**
   * 导出设置
   */
  exportSettings(): string {
    return JSON.stringify(this.settings, null, 2)
  }

  /**
   * 导入设置
   */
  importSettings(jsonString: string): { success: boolean; error?: string } {
    try {
      const imported = JSON.parse(jsonString) as Partial<UserSettings>
      
      // 验证导入的设置
      const requiredKeys = Object.keys(defaultSettings)
      const missingKeys = requiredKeys.filter(key => !(key in imported))
      
      if (missingKeys.length > 0) {
        return {
          success: false,
          error: `设置文件缺少以下字段: ${missingKeys.join(', ')}`
        }
      }

      this.setSettings(imported)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: '设置文件格式错误'
      }
    }
  }

  /**
   * 销毁模块
   */
  destroy(): void {
    this.removeAllListeners()
  }
}
