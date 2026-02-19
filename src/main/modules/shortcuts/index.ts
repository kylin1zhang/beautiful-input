import { globalShortcut } from 'electron'
import { EventEmitter } from 'events'
import { UserSettings } from '@shared/types/index.js'

interface ShortcutHandlers {
  toggleRecording: () => void
  quickTranslate?: () => void
  aiAssistant?: () => void
}

export class ShortcutsModule extends EventEmitter {
  private registeredShortcuts: Map<string, string> = new Map()
  private handlers: ShortcutHandlers | null = null

  /**
   * 注册所有快捷键
   */
  registerAll(
    shortcuts: UserSettings['shortcuts'],
    handlers: ShortcutHandlers
  ): void {
    this.handlers = handlers

    // 注册开始/停止录音快捷键
    if (shortcuts.toggleRecording) {
      this.register('toggleRecording', shortcuts.toggleRecording, handlers.toggleRecording)
    }

    // 注册快速翻译快捷键
    if (shortcuts.quickTranslate && handlers.quickTranslate) {
      this.register('quickTranslate', shortcuts.quickTranslate, handlers.quickTranslate)
    }

    // 注册 AI 助手快捷键
    if (shortcuts.aiAssistant && handlers.aiAssistant) {
      this.register('aiAssistant', shortcuts.aiAssistant, handlers.aiAssistant)
    }

    console.log('[Shortcuts] 快捷键注册完成')
  }

  /**
   * 注册单个快捷键
   */
  register(name: string, shortcut: string, handler: () => void): boolean {
    try {
      // 先注销已注册的同名快捷键
      this.unregister(name)

      // 标准化快捷键格式
      const normalizedShortcut = this.normalizeShortcut(shortcut)

      // 注册快捷键
      const success = globalShortcut.register(normalizedShortcut, () => {
        console.log(`[Shortcuts] 触发快捷键: ${name} (${shortcut})`)
        handler()
      })

      if (success) {
        this.registeredShortcuts.set(name, normalizedShortcut)
        console.log(`[Shortcuts] 注册成功: ${name} -> ${shortcut}`)
        return true
      } else {
        console.error(`[Shortcuts] 注册失败: ${name} -> ${shortcut}`)
        return false
      }
    } catch (error) {
      console.error(`[Shortcuts] 注册错误: ${name} -> ${shortcut}`, error)
      return false
    }
  }

  /**
   * 注销单个快捷键
   */
  unregister(name: string): void {
    const shortcut = this.registeredShortcuts.get(name)
    if (shortcut) {
      globalShortcut.unregister(shortcut)
      this.registeredShortcuts.delete(name)
      console.log(`[Shortcuts] 注销: ${name}`)
    }
  }

  /**
   * 注销所有快捷键
   */
  unregisterAll(): void {
    globalShortcut.unregisterAll()
    this.registeredShortcuts.clear()
    console.log('[Shortcuts] 所有快捷键已注销')
  }

  /**
   * 更新快捷键
   */
  updateShortcut(name: keyof UserSettings['shortcuts'], newShortcut: string): boolean {
    const handler = this.getHandler(name)
    if (!handler) {
      console.error(`[Shortcuts] 未找到 ${name} 的处理函数`)
      return false
    }

    return this.register(name, newShortcut, handler)
  }

  /**
   * 获取处理函数
   */
  private getHandler(name: keyof UserSettings['shortcuts']): (() => void) | null {
    if (!this.handlers) return null

    switch (name) {
      case 'toggleRecording':
        return this.handlers.toggleRecording
      case 'quickTranslate':
        return this.handlers.quickTranslate || null
      case 'aiAssistant':
        return this.handlers.aiAssistant || null
      default:
        return null
    }
  }

  /**
   * 标准化快捷键格式
   */
  private normalizeShortcut(shortcut: string): string {
    return shortcut
      .replace(/Command|Cmd/i, 'CommandOrControl')
      .replace(/Option/i, 'Alt')
      .replace(/\s+/g, '')
      .trim()
  }

  /**
   * 检查快捷键是否可用
   */
  isAvailable(shortcut: string): boolean {
    const normalized = this.normalizeShortcut(shortcut)
    return globalShortcut.isRegistered(normalized)
  }

  /**
   * 获取已注册的快捷键列表
   */
  getRegisteredShortcuts(): { name: string; shortcut: string }[] {
    return Array.from(this.registeredShortcuts.entries()).map(([name, shortcut]) => ({
      name,
      shortcut
    }))
  }

  /**
   * 验证快捷键格式
   */
  validateShortcut(shortcut: string): { valid: boolean; error?: string } {
    if (!shortcut || shortcut.trim() === '') {
      return { valid: false, error: '快捷键不能为空' }
    }

    const parts = shortcut.split('+')
    if (parts.length < 2) {
      return { valid: false, error: '快捷键必须包含修饰键和按键' }
    }

    const modifiers = ['Command', 'Control', 'Cmd', 'Ctrl', 'Alt', 'Option', 'Shift', 'Super', 'CommandOrControl']
    const hasModifier = parts.some(part => 
      modifiers.some(mod => part.toLowerCase().includes(mod.toLowerCase()))
    )

    if (!hasModifier) {
      return { valid: false, error: '快捷键必须包含修饰键（如 Ctrl、Cmd、Alt、Shift）' }
    }

    const hasKey = parts.some(part => 
      !modifiers.some(mod => part.toLowerCase().includes(mod.toLowerCase()))
    )

    if (!hasKey) {
      return { valid: false, error: '快捷键必须包含一个普通按键' }
    }

    return { valid: true }
  }

  /**
   * 销毁模块
   */
  destroy(): void {
    this.unregisterAll()
    this.removeAllListeners()
  }
}
