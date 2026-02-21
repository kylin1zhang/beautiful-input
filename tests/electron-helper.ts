import { _electron as electron, ElectronApplication, Page } from '@playwright/test'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let electronApp: ElectronApplication | null = null
let page: Page | null = null

/**
 * 启动 Electron 应用
 */
export async function launchElectronApp(): Promise<{ app: ElectronApplication; page: Page }> {
  if (electronApp && page) {
    return { app: electronApp, page }
  }

  // 指向打包后的主进程入口
  const mainEntry = join(__dirname, '../dist/main/index.js')

  // 启动 Electron 应用
  electronApp = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      NODE_ENV: 'production',  // 使用生产模式
      ELECTRON_ENABLE_LOGGING: '1',
    },
  })

  // 等待窗口加载
  const windows = electronApp.windows()
  if (windows.length === 0) {
    // 等待第一个窗口
    page = await electronApp.firstWindow()
  } else {
    page = windows[0]
  }

  // 等待页面加载完成
  await page.waitForLoadState('domcontentloaded')

  return { app: electronApp, page }
}

/**
 * 获取悬浮球窗口
 */
export async function getFloatWindow(): Promise<Page | null> {
  if (!electronApp) return null

  const windows = electronApp.windows()
  for (const win of windows) {
    const url = win.url()
    if (url.includes('float.html')) {
      return win
    }
  }
  return null
}

/**
 * 获取设置窗口
 */
export async function getSettingsWindow(): Promise<Page | null> {
  if (!electronApp) return null

  const windows = electronApp.windows()
  for (const win of windows) {
    const url = win.url()
    if (url.includes('settings.html')) {
      return win
    }
  }
  return null
}

/**
 * 关闭 Electron 应用
 */
export async function closeElectronApp(): Promise<void> {
  if (electronApp) {
    await electronApp.close()
    electronApp = null
    page = null
  }
}

/**
 * 等待窗口出现
 */
export async function waitForWindow(
  predicate: (url: string) => boolean,
  timeout = 10000
): Promise<Page | null> {
  if (!electronApp) return null

  const startTime = Date.now()
  while (Date.now() - startTime < timeout) {
    const windows = electronApp.windows()
    for (const win of windows) {
      if (predicate(win.url())) {
        return win
      }
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return null
}
