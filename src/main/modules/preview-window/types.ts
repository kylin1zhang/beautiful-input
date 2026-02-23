/**
 * 预览窗口类型定义
 */

/** 预览窗口状态 */
export type PreviewStatus = 'recording' | 'processing' | 'success' | 'error'

/** 预览窗口配置 */
export interface PreviewWindowConfig {
  width: number
  maxHeight: number
  opacity: number
  fadeOutDelay: number  // 淡出延迟（毫秒）
}

/** 预览窗口内容 */
export interface PreviewContent {
  text: string
  status: PreviewStatus
  statusText?: string
  isReplaceMode?: boolean  // 是否为替换模式
}

/** 预览窗口位置 */
export interface PreviewPosition {
  x: number
  y: number
}
