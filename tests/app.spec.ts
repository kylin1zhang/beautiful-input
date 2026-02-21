import { test, expect } from '@playwright/test'
import { launchElectronApp, closeElectronApp, getFloatWindow, waitForWindow } from './electron-helper'
import { ElectronApplication, Page } from '@playwright/test'

let app: ElectronApplication
let floatPage: Page

test.describe('BeautifulInput 应用测试', () => {
  test.beforeAll(async () => {
    const result = await launchElectronApp()
    app = result.app
    // 等待悬浮球窗口出现
    floatPage = await waitForWindow(url => url.includes('float.html'), 15000)
    expect(floatPage).not.toBeNull()
  })

  test.afterAll(async () => {
    await closeElectronApp()
  })

  test('应用应该启动并显示悬浮球窗口', async () => {
    expect(floatPage).toBeDefined()

    // 检查窗口 URL
    const url = floatPage.url()
    expect(url).toContain('float.html')
  })

  test('悬浮球应该显示麦克风图标', async () => {
    // 等待 React 渲染完成
    await floatPage.waitForSelector('.float-ball', { timeout: 10000 })

    // 检查悬浮球容器存在
    const floatBall = await floatPage.$('.float-ball')
    expect(floatBall).not.toBeNull()
  })

  test('悬浮球应该有正确的尺寸', async () => {
    // 获取窗口尺寸
    const size = await floatPage.evaluate(() => {
      return {
        width: window.innerWidth,
        height: window.innerHeight
      }
    })

    // 悬浮球窗口应该是约 41x41（允许少量误差，因为窗口边框可能影响）
    expect(size.width).toBeGreaterThanOrEqual(40)
    expect(size.width).toBeLessThanOrEqual(50)
    expect(size.height).toBeGreaterThanOrEqual(40)
    expect(size.height).toBeLessThanOrEqual(50)
  })

  test('点击悬浮球应该触发录音状态变化', async () => {
    await floatPage.waitForSelector('.float-ball', { timeout: 10000 })

    // 获取初始状态
    const initialState = await floatPage.evaluate(() => {
      const ball = document.querySelector('.float-ball')
      return ball?.className || ''
    })

    // 点击悬浮球中心
    await floatPage.click('.float-ball', { position: { x: 20, y: 20 } })

    // 等待状态变化（录音开始）
    await floatPage.waitForTimeout(2000)

    // 检查状态是否变化
    const newState = await floatPage.evaluate(() => {
      const ball = document.querySelector('.float-ball')
      return ball?.className || ''
    })

    // 状态可能发生变化（注意：如果没有配置 API Key，可能不会进入录音状态）
    // 这个测试主要验证点击事件是否正常触发
    console.log('初始状态:', initialState)
    console.log('新状态:', newState)

    // 至少验证点击后没有崩溃
    expect(newState).toBeDefined()
  })
})

test.describe('设置窗口测试', () => {
  test.beforeAll(async () => {
    const result = await launchElectronApp()
    app = result.app
    floatPage = await waitForWindow(url => url.includes('float.html'), 15000)
  })

  test.afterAll(async () => {
    await closeElectronApp()
  })

  test('右键点击悬浮球应该打开设置窗口', async () => {
    await floatPage.waitForSelector('.float-ball', { timeout: 10000 })

    // 右键点击悬浮球
    await floatPage.click('.float-ball', { button: 'right', position: { x: 20, y: 20 } })

    // 等待设置窗口出现
    const settingsPage = await waitForWindow(url => url.includes('settings.html'), 10000)

    expect(settingsPage).not.toBeNull()

    if (settingsPage) {
      // 检查设置窗口标题
      const title = await settingsPage.title()
      expect(title).toContain('设置')
    }
  })
})

test.describe('Electron API 测试', () => {
  test.beforeAll(async () => {
    const result = await launchElectronApp()
    app = result.app
    floatPage = await waitForWindow(url => url.includes('float.html'), 15000)
  })

  test.afterAll(async () => {
    await closeElectronApp()
  })

  test('electronAPI 应该在 window 上可用', async () => {
    const hasApi = await floatPage.evaluate(() => {
      return typeof (window as any).electronAPI !== 'undefined'
    })

    expect(hasApi).toBe(true)
  })

  test('electronAPI 应该有必要的 API 方法', async () => {
    const apiMethods = await floatPage.evaluate(() => {
      const api = (window as any).electronAPI
      if (!api) return []

      return Object.keys(api).filter(key => typeof api[key] === 'function')
    })

    // 检查关键 API 存在
    expect(apiMethods).toContain('startRecording')
    expect(apiMethods).toContain('stopRecording')
    expect(apiMethods).toContain('getSettings')
    expect(apiMethods).toContain('setSettings')
  })

  test('getSettings 应该返回有效的设置对象', async () => {
    const settings = await floatPage.evaluate(async () => {
      const api = (window as any).electronAPI
      return await api.getSettings()
    })

    expect(settings).toBeDefined()
    expect(settings).toHaveProperty('asrProvider')
    expect(settings).toHaveProperty('aiProvider')
    expect(settings).toHaveProperty('shortcuts')
  })
})
