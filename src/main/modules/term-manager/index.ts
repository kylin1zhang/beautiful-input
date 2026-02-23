import Store from 'electron-store'
import { TermStoreManager } from './store.js'
import { Term, TermLearnEvent, Hotword } from './types.js'

/**
 * 术语管理模块
 * 负责术语的存储、学习和热词生成
 */
export class TermManager {
  private store: TermStoreManager

  constructor(electronStore: Store) {
    this.store = new TermStoreManager(electronStore)
  }

  /**
   * 获取所有术语
   */
  getAllTerms(): Term[] {
    return this.store.getAll()
  }

  /**
   * 添加术语（手动）
   */
  addTerm(term: string, aliases: string[] = []): Term {
    return this.store.add({
      term,
      aliases,
      source: 'manual'
    })
  }

  /**
   * 更新术语
   */
  updateTerm(id: string, updates: Partial<Omit<Term, 'id' | 'createdAt'>>): Term | null {
    return this.store.update(id, updates)
  }

  /**
   * 删除术语
   */
  deleteTerm(id: string): boolean {
    return this.store.delete(id)
  }

  /**
   * 从用户修正中学习术语
   * 比较原始文本和修正后的文本，提取可能的术语
   */
  learnFromCorrection(event: TermLearnEvent): Term | null {
    if (!this.store.isAutoLearningEnabled()) {
      return null
    }

    const { originalText, correctedText } = event

    // 简单的差异检测：找出被修正的部分
    const diff = this.findDiff(originalText, correctedText)
    if (!diff) return null

    // 检查是否已存在相同术语
    const existingTerms = this.getAllTerms()
    const existing = existingTerms.find(
      t => t.term === diff.corrected || t.aliases.includes(diff.original)
    )

    if (existing) {
      // 已存在，增加使用次数
      this.store.incrementUsage(existing.id)
      // 如果别名不存在，添加它
      if (!existing.aliases.includes(diff.original)) {
        this.store.update(existing.id, {
          aliases: [...existing.aliases, diff.original]
        })
      }
      return existing
    }

    // 创建新术语
    return this.store.add({
      term: diff.corrected,
      aliases: [diff.original],
      source: 'auto'
    })
  }

  /**
   * 获取热词列表（用于 ASR）
   */
  getHotwords(): Hotword[] {
    return this.store.getHotwords()
  }

  /**
   * 获取术语提示词（用于 AI 处理）
   */
  getTermPrompt(): string {
    const terms = this.getAllTerms()
    if (terms.length === 0) return ''

    const termList = terms
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 50)
      .map(t => `- ${t.term}${t.aliases.length > 0 ? `（注意：可能会被误识别为 ${t.aliases.join('、')}）` : ''}`)
      .join('\n')

    return `用户常用术语列表，请确保这些词汇被正确识别和使用：\n${termList}`
  }

  /**
   * 设置自动学习开关
   */
  setAutoLearning(enabled: boolean): void {
    this.store.setAutoLearning(enabled)
  }

  /**
   * 获取自动学习状态
   */
  isAutoLearningEnabled(): boolean {
    return this.store.isAutoLearningEnabled()
  }

  /**
   * 查找文本差异
   * 返回被修正的部分
   */
  private findDiff(original: string, corrected: string): { original: string; corrected: string } | null {
    // 简单实现：查找第一个不同的连续片段
    const origWords = original.split(/(\s+)/)
    const corrWords = corrected.split(/(\s+)/)

    for (let i = 0; i < Math.max(origWords.length, corrWords.length); i++) {
      if (origWords[i] !== corrWords[i]) {
        // 找到差异
        const origPart = origWords[i]?.trim()
        const corrPart = corrWords[i]?.trim()
        if (origPart && corrPart && origPart !== corrPart) {
          return { original: origPart, corrected: corrPart }
        }
      }
    }

    return null
  }
}

export type { Term, TermLearnEvent, Hotword } from './types.js'
