import { ErrorType, AppError } from '../types'

/**
 * 格式化时间（秒 -> mm:ss）
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * 格式化日期时间
 */
export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * 格式化日期
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * 深拷贝
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * 安全地解析 JSON
 */
export function safeJsonParse<T>(str: string, defaultValue: T): T {
  try {
    return JSON.parse(str) as T
  } catch {
    return defaultValue
  }
}

/**
 * 将 Blob 转换为 Base64
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = reader.result as string
      resolve(base64.split(',')[1]) // 移除 data:audio/wav;base64, 前缀
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 将 Buffer 转换为 WAV 格式
 */
export function bufferToWav(
  buffer: Buffer,
  sampleRate: number = 16000,
  channels: number = 1
): Buffer {
  const byteRate = (sampleRate * channels * 16) / 8
  const blockAlign = (channels * 16) / 8
  const dataSize = buffer.length

  const wavHeader = Buffer.alloc(44)
  let offset = 0

  // RIFF chunk
  wavHeader.write('RIFF', offset)
  offset += 4
  wavHeader.writeUInt32LE(36 + dataSize, offset)
  offset += 4
  wavHeader.write('WAVE', offset)
  offset += 4

  // fmt chunk
  wavHeader.write('fmt ', offset)
  offset += 4
  wavHeader.writeUInt32LE(16, offset) // Subchunk1Size
  offset += 4
  wavHeader.writeUInt16LE(1, offset) // AudioFormat (PCM)
  offset += 2
  wavHeader.writeUInt16LE(channels, offset)
  offset += 2
  wavHeader.writeUInt32LE(sampleRate, offset)
  offset += 4
  wavHeader.writeUInt32LE(byteRate, offset)
  offset += 4
  wavHeader.writeUInt16LE(blockAlign, offset)
  offset += 2
  wavHeader.writeUInt16LE(16, offset) // BitsPerSample
  offset += 2

  // data chunk
  wavHeader.write('data', offset)
  offset += 4
  wavHeader.writeUInt32LE(dataSize, offset)

  return Buffer.concat([wavHeader, buffer])
}

/**
 * 合并多个音频 Buffer
 */
export function mergeAudioBuffers(buffers: Buffer[]): Buffer {
  return Buffer.concat(buffers)
}

/**
 * 创建应用错误
 */
export function createError(type: ErrorType, message: string, details?: string): AppError {
  return {
    type,
    message,
    details,
    timestamp: Date.now()
  }
}

/**
 * 延迟函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 重试函数
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      if (attempt < maxAttempts) {
        await sleep(delay * attempt)
      }
    }
  }

  throw lastError
}

/**
 * 检查是否为有效的快捷键格式
 */
export function isValidShortcut(shortcut: string): boolean {
  const parts = shortcut.split('+')
  if (parts.length < 2) return false

  const modifiers = ['Command', 'Control', 'Cmd', 'Ctrl', 'Alt', 'Option', 'Shift']
  const hasModifier = parts.some(part => modifiers.some(mod => part.toLowerCase().includes(mod.toLowerCase())))
  const hasKey = parts.some(part => !modifiers.some(mod => part.toLowerCase().includes(mod.toLowerCase())))

  return hasModifier && hasKey
}

/**
 * 将快捷键转换为 Electron 格式
 */
export function normalizeShortcut(shortcut: string): string {
  return shortcut
    .replace(/Command|Cmd/i, 'CommandOrControl')
    .replace(/Option/i, 'Alt')
    .replace(/\s+/g, '')
}

/**
 * 计算文本的 token 数量（估算）
 */
export function estimateTokens(text: string): number {
  // 简单估算：英文单词数 + 中文字符数 * 2
  const englishWords = text.split(/\s+/).filter(w => /^[a-zA-Z]+$/.test(w)).length
  const chineseChars = text.split('').filter(c => /[\u4e00-\u9fa5]/.test(c)).length
  return Math.ceil(englishWords + chineseChars * 2)
}

/**
 * 过滤敏感信息
 */
export function maskSensitiveInfo(text: string): string {
  // 隐藏 API Key
  return text.replace(/([a-zA-Z0-9_-]{20,})/g, '***')
}

/**
 * 验证邮箱格式
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * 验证 URL 格式
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
