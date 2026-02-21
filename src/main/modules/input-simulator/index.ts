import { EventEmitter } from 'events'
import { platform } from 'os'
import { clipboard } from 'electron'

/**
 * 输入模拟器模块
 * 统一使用剪贴板方式实现快速文本输入
 */
export class InputSimulatorModule extends EventEmitter {
  private isTyping = false

  /**
   * 输入文本（统一使用剪贴板方式）
   * @param text 要输入的文本
   * @returns 是否成功
   */
  async typeText(text: string): Promise<boolean> {
    return this.typeTextFast(text)
  }

  /**
   * 快速输入文本（强制使用剪贴板）
   * @param text 要输入的文本
   * @returns 是否成功
   */
  async typeTextFast(text: string): Promise<boolean> {
    if (this.isTyping) {
      console.warn('[Input Simulator] 正在输入中，请稍后再试')
      return false
    }

    this.isTyping = true

    try {
      console.log('[Input Simulator] 使用剪贴板输入，文本长度:', text.length)
      return await this.typeWithClipboard(text)
    } catch (error) {
      console.error('[Input Simulator] 输入失败:', error)
      return false
    } finally {
      this.isTyping = false
    }
  }

  /**
   * 使用剪贴板输入
   */
  private async typeWithClipboard(text: string): Promise<boolean> {
    console.log('[Input Simulator] 开始剪贴板输入，文本长度:', text.length)
    const originalClipboard = clipboard.readText()
    console.log('[Input Simulator] 原始剪贴板内容长度:', originalClipboard.length)

    try {
      // 写入文本到剪贴板
      clipboard.writeText(text)
      console.log('[Input Simulator] 已写入新文本到剪贴板')

      // 验证剪贴板内容
      const verifyClipboard = clipboard.readText()
      console.log('[Input Simulator] 验证剪贴板内容:', verifyClipboard.substring(0, 20) + '...')

      // 等待剪贴板写入完成
      await new Promise(resolve => setTimeout(resolve, 200))

      // Windows 平台使用多种方法确保粘贴
      if (platform() === 'win32') {
        const { execSync } = require('child_process')
        let pasteSuccess = false

        // 方法1: 使用 PowerShell VBScript SendKeys（最可靠）
        try {
          console.log('[Input Simulator] 尝试方法1: PowerShell SendKeys')
          execSync('powershell -Command "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys(\'^(v)\')"', { timeout: 3000 })
          console.log('[Input Simulator] PowerShell SendKeys 执行成功')
          pasteSuccess = true
        } catch (err) {
          console.log('[Input Simulator] PowerShell SendKeys 失败:', err)
        }

        // 方法2: 如果方法1失败，尝试 mshta
        if (!pasteSuccess) {
          try {
            console.log('[Input Simulator] 尝试方法2: mshta VBScript')
            execSync('mshta vbscript:ExecuteCode("Set WShell=CreateObject(\"\"WScript.Shell\"\"):WShell.SendKeys \"\"^v\"\":self.close\""\")', { timeout: 3000 })
            console.log('[Input Simulator] mshta 执行成功')
            pasteSuccess = true
          } catch (err) {
            console.log('[Input Simulator] mshta 失败:', err)
          }
        }

        if (!pasteSuccess) {
          throw new Error('所有粘贴方法都失败')
        }

        // 等待粘贴操作完成（增加等待时间）
        await new Promise(resolve => setTimeout(resolve, 500))
      } else {
        // macOS/Linux 平台
        console.log('[Input Simulator] 非 Windows 平台，暂不支持自动粘贴')
        return false
      }

      // 恢复原始剪贴板内容
      await new Promise(resolve => setTimeout(resolve, 100))
      clipboard.writeText(originalClipboard)
      console.log('[Input Simulator] 已恢复原始剪贴板内容')

      return true
    } catch (error) {
      console.error('[Input Simulator] 剪贴板输入失败:', error)
      // 确保恢复剪贴板
      try {
        clipboard.writeText(originalClipboard)
      } catch (restoreError) {
        console.error('[Input Simulator] 恢复剪贴板失败:', restoreError)
      }
      throw error
    }
  }

  /**
   * 获取当前激活的应用名称
   */
  async getActiveApplication(): Promise<string> {
    // Windows 平台使用 PowerShell 获取活动窗口
    if (platform() === 'win32') {
      try {
        const { execSync } = require('child_process')
        const result = execSync(
          'powershell -Command "(Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object -First 1).ProcessName"',
          { encoding: 'utf8' }
        )
        return result.toString().trim()
      } catch {
        return 'Unknown'
      }
    }
    return 'Unknown'
  }
}
