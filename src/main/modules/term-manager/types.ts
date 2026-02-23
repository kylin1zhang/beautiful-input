/**
 * 术语管理模块类型定义
 */

/** 术语项 */
export interface Term {
  id: string
  term: string          // 正确术语，如 "Gemini"
  aliases: string[]     // 常见误读，如 ["杰米尼", "吉米尼"]
  source: 'auto' | 'manual'  // 来源：自动学习 / 手动添加
  usageCount: number    // 使用次数（用于排序）
  createdAt: number
  updatedAt: number
}

/** 术语存储结构 */
export interface TermStore {
  version: number
  terms: Term[]
  autoLearningEnabled: boolean
}

/** 术语学习事件 */
export interface TermLearnEvent {
  originalText: string    // 原始识别文本
  correctedText: string   // 用户修正后的文本
  appName?: string        // 来源应用
  timestamp: number
}

/** 热词格式（用于 ASR） */
export interface Hotword {
  term: string
  weight: number  // 权重 1-10
}
