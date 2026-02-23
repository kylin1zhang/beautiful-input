import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './preview.css'

interface PreviewContent {
  text: string
  status: 'recording' | 'processing' | 'success' | 'error'
  statusText?: string
  isReplaceMode?: boolean
}

const PreviewApp: React.FC = () => {
  const [content, setContent] = useState<PreviewContent>({
    text: '',
    status: 'recording'
  })
  const [isFadingOut, setIsFadingOut] = useState(false)

  useEffect(() => {
    // 监听内容更新
    window.electronAPI?.onPreviewUpdate?.((data: PreviewContent) => {
      setContent(data)
    })

    // 监听淡出动画
    window.electronAPI?.onPreviewFadeOut?.(() => {
      setIsFadingOut(true)
    })
  }, [])

  const getStatusIcon = () => {
    switch (content.status) {
      case 'recording':
        return <span className="status-icon recording">🔴</span>
      case 'processing':
        return <span className="status-icon processing">⏳</span>
      case 'success':
        return <span className="status-icon success">✅</span>
      case 'error':
        return <span className="status-icon error">❌</span>
    }
  }

  const getStatusText = () => {
    if (content.statusText) return content.statusText
    switch (content.status) {
      case 'recording':
        return content.isReplaceMode ? '说出替换内容...' : ''
      case 'processing':
        return 'AI 处理中...'
      case 'success':
        return '已输入'
      case 'error':
        return '出错了'
    }
  }

  return (
    <div className={`preview-container ${isFadingOut ? 'fade-out' : ''}`}>
      {content.isReplaceMode && content.status === 'recording' && (
        <div className="replace-hint">替换模式</div>
      )}
      <div className="preview-text">{content.text || ' '}</div>
      {getStatusText() && (
        <div className={`preview-status ${content.status}`}>
          {getStatusIcon()}
          <span>{getStatusText()}</span>
        </div>
      )}
    </div>
  )
}

// 渲染应用
const container = document.getElementById('root')
if (container) {
  createRoot(container).render(<PreviewApp />)
}
