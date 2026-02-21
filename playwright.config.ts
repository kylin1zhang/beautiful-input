import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,  // Electron 测试需要串行
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,  // Electron 测试只能使用单个 worker
  reporter: 'html',
  timeout: 60000,  // 60秒超时

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
})
