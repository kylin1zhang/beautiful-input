import React, { useState, useEffect, useCallback } from 'react'
import { Settings, History, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import MicIcon from './MicIcon'
import './FloatBall.css'

type RecordingStatus = 'idle' | 'recording' | 'processing' | 'error'

interface FloatBallState {
  status: RecordingStatus
  duration: number
}

const FloatBall: React.FC = () => {
  const [state, setState] = useState<FloatBallState>({ status: 'idle', duration: 0 })
  const [showSuccess, setShowSuccess] = useState(false)
  const [floatOpacity, setFloatOpacity] = useState(0.9)
  const [showMenu, setShowMenu] = useState(false)

  // 监听录音状态
  useEffect(() => {
    const handleStatusChanged = (_: unknown, data: { status: string; duration?: number }) => {
      const status = data.status as RecordingStatus
      setState(prev => ({ ...prev, status, duration: data.duration || 0 }))
      if (status === 'idle') {
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 2000)
      }
    }
    const handleDurationUpdated = (_: unknown, data: { duration: number }) => {
      setState(prev => ({ ...prev, duration: data.duration }))
    }
    const handleError = () => {
      setState(prev => ({ ...prev, status: 'error' }))
      setTimeout(() => setState(prev => ({ ...prev, status: 'idle' })), 3000)
    }

    window.electronAPI?.onRecordingStatusChanged(handleStatusChanged)
    window.electronAPI?.onRecordingDurationUpdated(handleDurationUpdated)
    window.electronAPI?.onProcessingError(handleError)

    return () => {
      window.electronAPI?.removeAllListeners('recording-status-changed')
      window.electronAPI?.removeAllListeners('recording-duration-updated')
      window.electronAPI?.removeAllListeners('processing-error')
    }
  }, [])

  // 监听悬停状态（来自主进程）
  useEffect(() => {
    const handleHover = (isHovering: boolean) => {
      if (state.status === 'idle') {
        setShowMenu(isHovering)
      }
    }
    window.electronAPI?.onHoverStateChanged(handleHover)
    return () => {
      window.electronAPI?.removeHoverListener()
    }
  }, [state.status])

  // 加载设置
  useEffect(() => {
    window.electronAPI?.getSettings().then(s => setFloatOpacity(s.floatOpacity)).catch(() => {})
  }, [])

  useEffect(() => {
    const handleChange = () => {
      window.electronAPI?.getSettings().then(s => setFloatOpacity(s.floatOpacity)).catch(() => {})
    }
    window.electronAPI?.onSettingsUpdated(handleChange)
    return () => window.electronAPI?.removeAllListeners('settings-updated')
  }, [])

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // 点击录音
  const handleClick = useCallback(async () => {
    try {
      if (state.status === 'idle' || state.status === 'error') {
        await window.electronAPI?.startRecording()
      } else if (state.status === 'recording') {
        await window.electronAPI?.stopRecording()
      }
    } catch (e) {
      console.error('录音失败:', e)
    }
  }, [state.status])

  // 右键打开设置
  const handleContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    await window.electronAPI?.showSettings()
  }, [])

  // 打开设置
  const openSettings = useCallback(async () => {
    setShowMenu(false)
    await window.electronAPI?.showSettings()
  }, [])

  // 打开历史
  const openHistory = useCallback(async () => {
    setShowMenu(false)
    await window.electronAPI?.showHistory()
  }, [])

  // 获取内容
  const getContent = () => {
    switch (state.status) {
      case 'recording':
        return <span className="duration-text">{formatDuration(state.duration)}</span>
      case 'processing':
        return <Loader2 className="float-ball-icon spinning" />
      case 'error':
        return <AlertCircle className="float-ball-icon" />
      default:
        return showSuccess
          ? <CheckCircle className="float-ball-icon success" />
          : <MicIcon className="float-ball-icon" size={20} />
    }
  }

  return (
    <div
      className={`float-ball ${state.status}`}
      onContextMenu={handleContextMenu}
      style={{ opacity: floatOpacity }}
    >
      {/* 拖动区域 - 背景层 */}
      <div className="drag-area" />

      {/* 点击区域 - 图标层 */}
      <div className="click-area" onClick={handleClick}>
        {getContent()}
      </div>

      {state.status === 'recording' && (
        <div className="wave-animation">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.1}s` }} />
          ))}
        </div>
      )}

      {/* 悬停菜单 */}
      {showMenu && (
        <div className="hover-menu">
          <button className="menu-item" onClick={openSettings}>
            <Settings size={14} />
            <span>设置</span>
          </button>
          <button className="menu-item" onClick={openHistory}>
            <History size={14} />
            <span>历史</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default FloatBall
