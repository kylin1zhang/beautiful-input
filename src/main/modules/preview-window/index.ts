import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { PreviewWindowConfig, PreviewContent, PreviewStatus, PreviewPosition } from './types.js'
import { FloatPosition } from '@shared/types'

/**
 * 预览窗口模块
 * 管理流式识别结果的实时显示
 */
export class PreviewWindow {
  private window: BrowserWindow | null = null
  private config: PreviewWindowConfig
  private hideTimeout: NodeJS.Timeout | null = null
  private currentContent: PreviewContent = {
    text: '',
    status: 'recording'
  }

  constructor(config?: Partial<PreviewWindowConfig>) {
    this.config = {
      width: 300,
      maxHeight: 200,
      opacity: 0.95,
      fadeOutDelay: 2000,
      ...config
    }
  }

  /**
   * 创建预览窗口
   */
  create(floatPosition?: FloatPosition): void {
    if (this.window && !this.window.isDestroyed()) {
      return
    }

    // 计算窗口位置（在悬浮球旁边）
    const position = this.calculatePosition(floatPosition)

    this.window = new BrowserWindow({
      width: this.config.width,
      height: 80,
      maxWidth: this.config.width,
      maxHeight: this.config.maxHeight,
      x: position.x,
      y: position.y,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, '../preload/index.mjs')
      }
    })

    // 加载预览页面
    if (process.env.NODE_ENV === 'development') {
      this.window.loadURL('http://localhost:5173/preview.html')
    } else {
      this.window.loadFile(join(__dirname, '../renderer/preview.html'))
    }

    this.window.webContents.on('did-finish-load', () => {
      // 发送初始内容
      this.updateContent(this.currentContent)
    })
  }

  /**
   * 显示预览窗口
   */
  show(floatPosition?: FloatPosition): void {
    this.clearHideTimeout()

    if (!this.window || this.window.isDestroyed()) {
      this.create(floatPosition)
    } else {
      // 更新位置
      if (floatPosition) {
        const position = this.calculatePosition(floatPosition)
        this.window.setPosition(position.x, position.y)
      }
      this.window.show()
    }
  }

  /**
   * 隐藏预览窗口
   */
  hide(immediate = false): void {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    if (immediate) {
      this.window.hide()
      return
    }

    // 延迟淡出
    this.clearHideTimeout()
    this.hideTimeout = setTimeout(() => {
      if (this.window && !this.window.isDestroyed()) {
        // 发送淡出动画
        this.window.webContents.send('preview-fade-out')
        setTimeout(() => {
          this.window?.hide()
        }, 300)
      }
    }, this.config.fadeOutDelay)
  }

  /**
   * 更新显示内容
   */
  updateContent(content: Partial<PreviewContent>): void {
    this.currentContent = { ...this.currentContent, ...content }

    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('preview-update', this.currentContent)

      // 根据内容调整窗口高度
      this.adjustWindowHeight()
    }
  }

  /**
   * 设置状态
   */
  setStatus(status: PreviewStatus, statusText?: string): void {
    this.updateContent({ status, statusText })
  }

  /**
   * 更新文字
   */
  updateText(text: string): void {
    this.updateContent({ text })
  }

  /**
   * 设置替换模式
   */
  setReplaceMode(isReplace: boolean): void {
    this.updateContent({ isReplaceMode: isReplace })
  }

  /**
   * 销毁窗口
   */
  destroy(): void {
    this.clearHideTimeout()
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
    this.window = null
  }

  /**
   * 计算窗口位置
   */
  private calculatePosition(floatPosition?: FloatPosition): PreviewPosition {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize

    let x = floatPosition?.x ?? screenWidth - 100
    let y = floatPosition?.y ?? screenHeight - 100

    // 在悬浮球右侧显示
    x = x + 50

    // 确保不超出屏幕边界
    if (x + this.config.width > screenWidth) {
      x = (floatPosition?.x ?? screenWidth - 100) - this.config.width - 10
    }
    if (y + this.config.maxHeight > screenHeight) {
      y = screenHeight - this.config.maxHeight - 10
    }

    return { x, y }
  }

  /**
   * 调整窗口高度
   */
  private adjustWindowHeight(): void {
    if (!this.window || this.window.isDestroyed()) return

    // 根据文字长度估算高度
    const text = this.currentContent.text
    const lines = Math.ceil(text.length / 20)  // 假设每行约 20 个字符
    const height = Math.min(this.config.maxHeight, Math.max(60, 30 + lines * 24))

    this.window.setSize(this.config.width, height)
  }

  /**
   * 清除隐藏超时
   */
  private clearHideTimeout(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout)
      this.hideTimeout = null
    }
  }
}
