import { EventEmitter } from 'events'
import { dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { HistoryItem, ProcessingResult } from '@shared/types/index.js'
import { StoreService } from '../../services/store.service.js'
import { generateId, formatDate } from '@shared/utils/index.js'

interface HistoryOptions {
  page?: number
  limit?: number
  startDate?: number
  endDate?: number
}

interface HistoryPageResult {
  items: HistoryItem[]
  total: number
  page: number
  totalPages: number
}

export class HistoryModule extends EventEmitter {
  private store: StoreService
  private history: HistoryItem[]
  private maxItems: number

  constructor(store: StoreService, maxItems: number = 1000) {
    super()
    this.store = store
    this.maxItems = maxItems
    this.history = this.loadHistory()
    
    // 启动时清理过期记录
    this.cleanupOldRecords()
  }

  /**
   * 加载历史记录
   */
  private loadHistory(): HistoryItem[] {
    return this.store.getHistory()
  }

  /**
   * 保存历史记录
   */
  private saveHistory(): void {
    this.store.setHistory(this.history)
  }

  /**
   * 添加历史记录
   */
  async addHistory(result: ProcessingResult): Promise<HistoryItem> {
    const item: HistoryItem = {
      id: generateId(),
      originalText: result.originalText,
      processedText: result.processedText,
      timestamp: result.timestamp,
      appName: result.appName,
      duration: result.duration,
      tags: []
    }

    // 添加到开头
    this.history.unshift(item)

    // 限制数量
    if (this.history.length > this.maxItems) {
      this.history = this.history.slice(0, this.maxItems)
    }

    this.saveHistory()
    this.emit('historyAdded', item)

    return item
  }

  /**
   * 获取历史记录（分页）
   */
  getHistory(options: HistoryOptions = {}): HistoryPageResult {
    const { page = 1, limit = 20, startDate, endDate } = options

    let filtered = [...this.history]

    // 日期筛选
    if (startDate) {
      filtered = filtered.filter(item => item.timestamp >= startDate)
    }
    if (endDate) {
      filtered = filtered.filter(item => item.timestamp <= endDate)
    }

    // 计算分页
    const total = filtered.length
    const totalPages = Math.ceil(total / limit)
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const items = filtered.slice(startIndex, endIndex)

    return {
      items,
      total,
      page,
      totalPages
    }
  }

  /**
   * 获取单条历史记录
   */
  getHistoryItem(id: string): HistoryItem | null {
    return this.history.find(item => item.id === id) || null
  }

  /**
   * 删除历史记录
   */
  deleteHistory(id: string): boolean {
    const index = this.history.findIndex(item => item.id === id)
    if (index === -1) {
      return false
    }

    const item = this.history[index]
    this.history.splice(index, 1)
    this.saveHistory()
    this.emit('historyDeleted', item)

    return true
  }

  /**
   * 清空历史记录
   */
  clearHistory(): boolean {
    this.history = []
    this.saveHistory()
    this.emit('historyCleared')
    return true
  }

  /**
   * 搜索历史记录
   */
  searchHistory(query: string): HistoryItem[] {
    if (!query || query.trim() === '') {
      return this.history
    }

    const lowerQuery = query.toLowerCase()
    return this.history.filter(item =>
      item.originalText.toLowerCase().includes(lowerQuery) ||
      item.processedText.toLowerCase().includes(lowerQuery) ||
      item.appName.toLowerCase().includes(lowerQuery) ||
      item.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    )
  }

  /**
   * 更新历史记录标签
   */
  updateTags(id: string, tags: string[]): boolean {
    const item = this.history.find(item => item.id === id)
    if (!item) {
      return false
    }

    item.tags = tags
    this.saveHistory()
    this.emit('historyUpdated', item)

    return true
  }

  /**
   * 导出历史记录
   */
  async exportHistory(format: 'txt' | 'md' = 'md'): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const defaultPath = join(
      require('os').homedir(),
      'Downloads',
      `typeless-history-${timestamp}.${format}`
    )

    const { filePath } = await dialog.showSaveDialog({
      title: '导出历史记录',
      defaultPath,
      filters: [
        { name: format === 'md' ? 'Markdown 文件' : '文本文件', extensions: [format] }
      ]
    })

    if (!filePath) {
      return ''
    }

    const content = this.formatHistoryForExport(format)
    await writeFile(filePath, content, 'utf-8')

    return filePath
  }

  /**
   * 格式化历史记录用于导出
   */
  private formatHistoryForExport(format: 'txt' | 'md'): string {
    if (format === 'md') {
      return this.formatAsMarkdown()
    } else {
      return this.formatAsText()
    }
  }

  /**
   * 格式化为 Markdown
   */
  private formatAsMarkdown(): string {
    const lines: string[] = [
      '# Typeless 历史记录',
      '',
      `导出时间: ${new Date().toLocaleString('zh-CN')}`,
      `总记录数: ${this.history.length}`,
      '',
      '---',
      ''
    ]

    this.history.forEach((item, index) => {
      lines.push(`## 记录 ${index + 1}`)
      lines.push('')
      lines.push(`**时间:** ${formatDate(item.timestamp)}`)
      lines.push(`**应用:** ${item.appName}`)
      lines.push(`**时长:** ${item.duration} 秒`)
      if (item.tags.length > 0) {
        lines.push(`**标签:** ${item.tags.join(', ')}`)
      }
      lines.push('')
      lines.push('### 原始文本')
      lines.push('')
      lines.push(item.originalText)
      lines.push('')
      lines.push('### 处理后文本')
      lines.push('')
      lines.push(item.processedText)
      lines.push('')
      lines.push('---')
      lines.push('')
    })

    return lines.join('\n')
  }

  /**
   * 格式化为纯文本
   */
  private formatAsText(): string {
    const lines: string[] = [
      'Typeless 历史记录',
      '',
      `导出时间: ${new Date().toLocaleString('zh-CN')}`,
      `总记录数: ${this.history.length}`,
      '',
      '='.repeat(50),
      ''
    ]

    this.history.forEach((item, index) => {
      lines.push(`记录 ${index + 1}`)
      lines.push(`时间: ${formatDate(item.timestamp)}`)
      lines.push(`应用: ${item.appName}`)
      lines.push(`时长: ${item.duration} 秒`)
      if (item.tags.length > 0) {
        lines.push(`标签: ${item.tags.join(', ')}`)
      }
      lines.push('')
      lines.push('原始文本:')
      lines.push(item.originalText)
      lines.push('')
      lines.push('处理后文本:')
      lines.push(item.processedText)
      lines.push('')
      lines.push('-'.repeat(50))
      lines.push('')
    })

    return lines.join('\n')
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalRecords: number
    totalDuration: number
    todayRecords: number
    thisWeekRecords: number
    topApps: { name: string; count: number }[]
  } {
    const now = Date.now()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStart = today.getTime()

    const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000

    const todayRecords = this.history.filter(item => item.timestamp >= todayStart)
    const thisWeekRecords = this.history.filter(item => item.timestamp >= weekStart)

    // 统计应用使用次数
    const appCounts: Record<string, number> = {}
    this.history.forEach(item => {
      appCounts[item.appName] = (appCounts[item.appName] || 0) + 1
    })

    const topApps = Object.entries(appCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    return {
      totalRecords: this.history.length,
      totalDuration: this.history.reduce((sum, item) => sum + item.duration, 0),
      todayRecords: todayRecords.length,
      thisWeekRecords: thisWeekRecords.length,
      topApps
    }
  }

  /**
   * 清理过期记录
   */
  private cleanupOldRecords(): void {
    const retentionDays = this.store.getSettings()?.historyRetentionDays || 30
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000

    const originalLength = this.history.length
    this.history = this.history.filter(item => item.timestamp >= cutoffTime)

    if (this.history.length < originalLength) {
      this.saveHistory()
      console.log(`[History] 清理了 ${originalLength - this.history.length} 条过期记录`)
    }
  }

  /**
   * 销毁模块
   */
  destroy(): void {
    this.saveHistory()
    this.removeAllListeners()
  }
}
