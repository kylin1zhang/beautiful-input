import { EventEmitter } from 'events'
import { platform } from 'os'
import { clipboard } from 'electron'

export class InputSimulatorModule extends EventEmitter {
  private isTyping = false
  private nut: typeof import('@nut-tree-fork/nut-js') | null = null
  private nutLoadPromise: Promise<void> | null = null

  constructor() {
    super()
    // 延迟加载 nut-js
    this.nutLoadPromise = this.loadNutJs()
  }

  private async loadNutJs() {
    try {
      this.nut = await import('@nut-tree-fork/nut-js')
    } catch (error) {
      console.warn('[Input Simulator] nut-js 加载失败，将使用剪贴板降级方案')
    }
  }

  /**
   * 检测文本是否主要为中文
   */
  private isMainlyChinese(text: string): boolean {
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g)
    const chineseCount = chineseChars ? chineseChars.length : 0
    const totalCount = text.replace(/\s/g, '').length
    // 如果中文字符占比超过 30%，认为主要是中文
    return totalCount > 0 && (chineseCount / totalCount) > 0.3
  }

  /**
   * 输入文本
   * @param text 要输入的文本
   * @returns 是否成功
   */
  async typeText(text: string): Promise<boolean> {
    if (this.isTyping) {
      console.warn('[Input Simulator] 正在输入中，请稍后再试')
      return false
    }

    this.isTyping = true

    try {
      // **优化：如果主要是中文，直接使用剪贴板一次性粘贴，避免逐字输入的卡顿感**
      if (this.isMainlyChinese(text)) {
        console.log('[Input Simulator] 检测到中文文本，使用剪贴板快速输入')
        return await this.typeWithClipboard(text)
      }

      // 英文或混合文本，尝试使用 nut-js 输入
      if (this.nut) {
        await this.typeWithNutJs(text)
        return true
      } else {
        // 降级到剪贴板
        return await this.typeWithClipboard(text)
      }
    } catch (error) {
      console.error('[Input Simulator] 输入失败:', error)
      // 尝试剪贴板降级
      try {
        return await this.typeWithClipboard(text)
      } catch (clipboardError) {
        console.error('[Input Simulator] 剪贴板降级也失败:', clipboardError)
        return false
      }
    } finally {
      this.isTyping = false
    }
  }

  /**
   * 使用 nut-js 输入
   */
  private async typeWithNutJs(text: string): Promise<void> {
    // 等待 nut-js 加载完成
    await this.nutLoadPromise

    if (!this.nut) {
      throw new Error('nut-js 未加载')
    }

    // 延迟一小段时间，确保焦点在正确的窗口
    await this.nut.sleep(100)

    // **关键修复：在开始输入前保存剪贴板，输入完成后恢复**
    const originalClipboard = clipboard.readText()

    try {
      // 分段输入，避免过长文本导致问题
      const chunks = this.splitTextIntoChunks(text, 50)

      for (const chunk of chunks) {
        // 处理特殊字符，传入已保存的剪贴板内容（避免重复读取）
        await this.typeChunkWithNutJs(chunk, originalClipboard)
        await this.nut.sleep(10)
      }
    } finally {
      // 确保最终恢复剪贴板（无论成功或失败）
      await this.nut.sleep(50) // 等待所有粘贴操作完成
      clipboard.writeText(originalClipboard)
    }
  }

  /**
   * 使用 nut-js 输入文本块
   * @param text 要输入的文本块
   * @param originalClipboard 用户原始的剪贴板内容（用于在内部使用，不再重复保存/恢复）
   */
  private async typeChunkWithNutJs(text: string, originalClipboard: string): Promise<void> {
    if (!this.nut) return

    const { Key, keyboard } = this.nut

    for (const char of text) {
      // 处理中文字符 - 直接使用剪贴板，不保存/恢复（因为外层已经处理）
      if (/[\u4e00-\u9fa5]/.test(char)) {
        clipboard.writeText(char)
        await keyboard.type(Key.LeftControl, Key.V)
        // 不再恢复剪贴板，因为恢复操作在外层 finally 块中统一处理
      }
      // 处理英文和数字
      else if (/[a-zA-Z0-9]/.test(char)) {
        await keyboard.type(char)
      }
      // 处理空格
      else if (char === ' ') {
        await keyboard.type(Key.Space)
      }
      // 处理换行
      else if (char === '\n') {
        await keyboard.type(Key.Return)
      }
      // 处理制表符
      else if (char === '\t') {
        await keyboard.type(Key.Tab)
      }
      // 处理标点符号
      else {
        const keyMapping: Record<string, nut.Key> = {
          '.': Key.Period,
          ',': Key.Comma,
          '!': Key.Exclamation,
          '?': Key.Question,
          ':': Key.Colon,
          ';': Key.Semicolon,
          '-': Key.Minus,
          '_': Key.Underscore,
          '=': Key.Equal,
          '+': Key.Plus,
          '[': Key.LeftBracket,
          ']': Key.RightBracket,
          '{': Key.LeftBrace,
          '}': Key.RightBrace,
          '\\': Key.Backslash,
          '|': Key.Pipe,
          '/': Key.Slash,
          '*': Key.Asterisk,
          "'": Key.Quote,
          '"': Key.DoubleQuote,
          '`': Key.Backquote,
          '~': Key.Tilde,
          '@': Key.At,
          '#': Key.Hash,
          '$': Key.Dollar,
          '%': Key.Percent,
          '^': Key.Caret,
          '&': Key.Ampersand,
          '(': Key.LeftParenthesis,
          ')': Key.RightParenthesis,
          '<': Key.Less,
          '>': Key.Greater
        }

        const key = keyMapping[char]
        if (key) {
          await keyboard.type(key)
        } else {
          // 未知字符使用剪贴板，同样不保存/恢复
          clipboard.writeText(char)
          await keyboard.type(Key.LeftControl, Key.V)
        }
      }

      // 每个字符之间添加微小延迟
      await this.nut.sleep(5)
    }
  }

  /**
   * 使用剪贴板输入（针对 Word 优化的版本）
   */
  private async typeWithClipboard(text: string): Promise<boolean> {
    console.log('[Input Simulator] 开始剪贴板输入，文本长度:', text.length)
    const originalClipboard = clipboard.readText()
    console.log('[Input Simulator] 原始剪贴板内容长度:', originalClipboard.length)

    try {
      // 保存剪贴板历史（用于后续恢复）
      const clipboardHistory: string[] = [originalClipboard]

      // 写入文本到剪贴板
      clipboard.writeText(text)
      console.log('[Input Simulator] 已写入新文本到剪贴板')

      // 验证剪贴板内容
      const verifyClipboard = clipboard.readText()
      console.log('[Input Simulator] 验证剪贴板内容:', verifyClipboard.substring(0, 20) + '...')

      // 等待剪贴板写入完成
      await new Promise(resolve => setTimeout(resolve, 150))

      // Windows 平台使用多种方法确保粘贴
      if (platform() === 'win32') {
        const { execSync } = require('child_process')
        let pasteSuccess = false

        // 方法1: 使用 PowerShell VBScript SendKeys（最可靠）
        try {
          console.log('[Input Simulator] 尝试方法1: PowerShell SendKeys')
          execSync('powershell -Command "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys(\'^(v)\')"', { timeout: 2000 })
          console.log('[Input Simulator] PowerShell SendKeys 执行成功')
          pasteSuccess = true
        } catch (err) {
          console.log('[Input Simulator] PowerShell SendKeys 失败:', err)
        }

        // 方法2: 如果方法1失败，尝试 nut-js
        if (!pasteSuccess && this.nut) {
          try {
            console.log('[Input Simulator] 尝试方法2: nut-js 模拟 Ctrl+V')
            const { Key, keyboard } = this.nut
            // 添加延迟确保焦点正确
            await this.nut.sleep(100)
            await keyboard.type(Key.LeftControl, Key.V)
            console.log('[Input Simulator] nut-js 模拟成功')
            pasteSuccess = true
          } catch (err) {
            console.log('[Input Simulator] nut-js 模拟失败:', err)
          }
        }

        // 方法3: 如果前两种方法都失败，尝试 mshta
        if (!pasteSuccess) {
          try {
            console.log('[Input Simulator] 尝试方法3: mshta VBScript')
            execSync('mshta vbscript:ExecuteCode("Set WShell=CreateObject(\"\"WScript.Shell\"\"):WShell.SendKeys \"\"^v\"\":self.close\"\"\")', { timeout: 2000 })
            console.log('[Input Simulator] mshta 执行成功')
            pasteSuccess = true
          } catch (err) {
            console.log('[Input Simulator] mshta 失败:', err)
          }
        }

        if (!pasteSuccess) {
          console.log('[Input Simulator] 所有粘贴方法均失败')
          return false
        }
      } else if (platform() === 'darwin') {
        // macOS: Command + V
        const { execSync } = require('child_process')
        execSync('osascript -e \'tell application "System Events" to keystroke "v" using command down\'')
      } else {
        // Linux: Ctrl + V
        const { execSync } = require('child_process')
        execSync('xdotool key ctrl+v')
      }

      // 关键修复：等待更长时间确保粘贴完成（Word 可能需要更长时间）
      console.log('[Input Simulator] 等待粘贴操作完成...')
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 验证剪贴板内容（不作为成功/失败的判断标准）
      const afterPasteClipboard = clipboard.readText()
      console.log('[Input Simulator] 粘贴后剪贴板内容:', afterPasteClipboard.substring(0, 20) + '...')

      console.log('[Input Simulator] 剪贴板输入完成')
      return true
    } catch (error) {
      console.error('[Input Simulator] 剪贴板输入失败:', error)
      return false
    } finally {
      // 关键修复：延迟更长时间再恢复剪贴板
      // Windows 剪贴板历史功能可能需要更长时间
      await new Promise(resolve => setTimeout(resolve, 500))

      // 恢复原始剪贴板
      clipboard.writeText(originalClipboard)
      console.log('[Input Simulator] 已恢复原始剪贴板')

      // 额外等待确保恢复操作完成
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }

  /**
   * 将文本分割成块
   */
  private splitTextIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize))
    }
    return chunks
  }

  /**
   * 获取当前活动应用名称
   */
  async getActiveApplication(): Promise<string> {
    try {
      const os = platform()

      if (os === 'darwin') {
        const { exec } = require('child_process')
        return new Promise((resolve) => {
          exec(
            'osascript -e \'tell application "System Events" to get name of first application process whose frontmost is true\'',
            (error: Error | null, stdout: string) => {
              if (error) {
                resolve('未知应用')
              } else {
                resolve(stdout.trim())
              }
            }
          )
        })
      } else if (os === 'win32') {
        const { exec } = require('child_process')
        return new Promise((resolve) => {
          exec(
            'powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -ne \"\"} | Select-Object -First 1 -ExpandProperty ProcessName"',
            (error: Error | null, stdout: string) => {
              if (error) {
                resolve('未知应用')
              } else {
                resolve(stdout.trim())
              }
            }
          )
        })
      } else {
        // Linux
        const { exec } = require('child_process')
        return new Promise((resolve) => {
          exec(
            'xdotool getactivewindow getwindowname',
            (error: Error | null, stdout: string) => {
              if (error) {
                resolve('未知应用')
              } else {
                resolve(stdout.trim())
              }
            }
          )
        })
      }
    } catch (error) {
      console.error('[Input Simulator] 获取活动应用失败:', error)
      return '未知应用'
    }
  }

  /**
   * 获取输入状态
   */
  getIsTyping(): boolean {
    return this.isTyping
  }

  /**
   * 销毁模块
   */
  destroy(): void {
    this.isTyping = false
    this.removeAllListeners()
  }
}
