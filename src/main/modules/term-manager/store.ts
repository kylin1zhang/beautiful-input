import Store from 'electron-store'
import { Term, TermStore, Hotword } from './types.js'

const STORE_KEY = 'term-manager'

/** 默认术语存储 */
const defaultTermStore: TermStore = {
  version: 1,
  terms: [],
  autoLearningEnabled: true
}

/**
 * 术语存储管理类
 */
export class TermStoreManager {
  private store: Store

  constructor(store: Store) {
    this.store = store
    this.initialize()
  }

  /**
   * 初始化存储
   */
  private initialize(): void {
    const existing = this.store.get(STORE_KEY)
    if (!existing) {
      this.store.set(STORE_KEY, defaultTermStore)
    }
  }

  /**
   * 获取所有术语
   */
  getAll(): Term[] {
    const data = this.store.get(STORE_KEY) as TermStore
    return data?.terms || []
  }

  /**
   * 添加术语
   */
  add(term: Omit<Term, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>): Term {
    const terms = this.getAll()
    const now = Date.now()
    const newTerm: Term = {
      ...term,
      id: `term-${now}-${Math.random().toString(36).substr(2, 9)}`,
      usageCount: 1,
      createdAt: now,
      updatedAt: now
    }
    terms.push(newTerm)
    this.save(terms)
    return newTerm
  }

  /**
   * 更新术语
   */
  update(id: string, updates: Partial<Omit<Term, 'id' | 'createdAt'>>): Term | null {
    const terms = this.getAll()
    const index = terms.findIndex(t => t.id === id)
    if (index === -1) return null

    terms[index] = {
      ...terms[index],
      ...updates,
      updatedAt: Date.now()
    }
    this.save(terms)
    return terms[index]
  }

  /**
   * 删除术语
   */
  delete(id: string): boolean {
    const terms = this.getAll()
    const index = terms.findIndex(t => t.id === id)
    if (index === -1) return false

    terms.splice(index, 1)
    this.save(terms)
    return true
  }

  /**
   * 增加使用次数
   */
  incrementUsage(id: string): void {
    const terms = this.getAll()
    const term = terms.find(t => t.id === id)
    if (term) {
      term.usageCount++
      term.updatedAt = Date.now()
      this.save(terms)
    }
  }

  /**
   * 获取热词列表（用于 ASR）
   */
  getHotwords(): Hotword[] {
    const terms = this.getAll()
    return terms
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 100)  // 最多 100 个热词
      .map(t => ({
        term: t.term,
        weight: Math.min(10, Math.max(1, Math.floor(t.usageCount / 2) + 1))
      }))
  }

  /**
   * 检查是否启用自动学习
   */
  isAutoLearningEnabled(): boolean {
    const data = this.store.get(STORE_KEY) as TermStore
    return data?.autoLearningEnabled ?? true
  }

  /**
   * 设置自动学习开关
   */
  setAutoLearning(enabled: boolean): void {
    const data = this.store.get(STORE_KEY) as TermStore
    data.autoLearningEnabled = enabled
    this.store.set(STORE_KEY, data)
  }

  /**
   * 保存术语列表
   */
  private save(terms: Term[]): void {
    const data = this.store.get(STORE_KEY) as TermStore
    data.terms = terms
    this.store.set(STORE_KEY, data)
  }
}
