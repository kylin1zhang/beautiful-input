import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Mic, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import './FloatBall.css'

type RecordingStatus = 'idle' | 'recording' | 'processing' | 'error'

interface FloatBallState {
  status: RecordingStatus
  duration: number
  message?: string
}

const FloatBall: React.FC = () => {
  const [state, setState] = useState<FloatBallState>({
    status: 'idle',
    duration: 0
  })
  const [showSuccess, setShowSuccess] = useState(false)
  const [floatOpacity, setFloatOpacity] = useState(0.9)
  const ballRef = useRef<HTMLDivElement>(null)

  // 检查 electronAPI 是否可用
  const checkElectronAPI = () => {
    if (!window.electronAPI) {
      console.error('[FloatBall] electronAPI 不可用，preload 脚本可能未正确加载')
      return false
    }
    return true
  }

  // 监听录音状态变化
  useEffect(() => {
    if (!checkElectronAPI()) return

    const handleStatusChanged = (_: unknown, data: { status: RecordingStatus; duration?: number }) => {
      setState(prev => ({
        ...prev,
        status: data.status,
        duration: data.duration || 0
      }))

      if (data.status === 'idle') {
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 2000)
      }
    }

    const handleDurationUpdated = (_: unknown, data: { duration: number }) => {
      setState(prev => ({
        ...prev,
        duration: data.duration
      }))
    }

    const handleError = (_: unknown, error: { type: string; message: string }) => {
      setState(prev => ({
        ...prev,
        status: 'error',
        message: error.message
      }))

      setTimeout(() => {
        setState(prev => ({
          ...prev,
          status: 'idle',
          message: undefined
        }))
      }, 3000)
    }

    window.electronAPI!.onRecordingStatusChanged(handleStatusChanged)
    window.electronAPI!.onRecordingDurationUpdated(handleDurationUpdated)
    window.electronAPI!.onProcessingError(handleError)

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('recording-status-changed')
        window.electronAPI.removeAllListeners('recording-duration-updated')
        window.electronAPI.removeAllListeners('processing-error')
      }
    }
  }, [])

  // 加载设置
  useEffect(() => {
    if (!checkElectronAPI()) return

    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI!.getSettings()
        setFloatOpacity(settings.floatOpacity)
      } catch (error) {
        console.error('加载设置失败:', error)
      }
    }
    loadSettings()
  }, [])

  // 监听设置更新
  useEffect(() => {
    if (!checkElectronAPI()) return

    const handleSettingsChanged = () => {
      window.electronAPI!.getSettings().then(settings => {
        setFloatOpacity(settings.floatOpacity)
      }).catch(console.error)
    }

    window.electronAPI!.onSettingsUpdated(handleSettingsChanged)
    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('settings-updated')
      }
    }
  }, [])

  // 格式化时长
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 处理点击
  const handleClick = useCallback(async () => {
    if (!checkElectronAPI()) {
      console.error('[FloatBall] 无法启动录音：electronAPI 不可用')
      return
    }

    try {
      if (state.status === 'idle' || state.status === 'error') {
        await window.electronAPI!.startRecording()
      } else if (state.status === 'recording') {
        await window.electronAPI!.stopRecording()
      }
    } catch (error) {
      console.error('录音操作失败:', error)
    }
  }, [state.status])

  // 处理右键菜单 - 直接打开设置
  const handleContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault()
    if (!checkElectronAPI()) {
      console.error('[FloatBall] 无法打开设置：electronAPI 不可用')
      return
    }
    // 右键点击直接打开设置窗口
    await window.electronAPI!.showSettings()
  }, [])

  // 获取图标
  const getIcon = () => {
    switch (state.status) {
      case 'recording':
        return <Mic className="float-ball-icon recording" />
      case 'processing':
        return <Loader2 className="float-ball-icon spinning" />
      case 'error':
        return <AlertCircle className="float-ball-icon" />
      default:
        return showSuccess 
          ? <CheckCircle className="float-ball-icon success" />
          : <Mic className="float-ball-icon" />
    }
  }

  return (
    <div
      ref={ballRef}
      className={`float-ball ${state.status}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{ opacity: floatOpacity }}
    >
      {getIcon()}
      
      {state.status === 'recording' && (
        <div className="recording-indicator">
          <span className="recording-dot" />
          <span className="recording-time">{formatDuration(state.duration)}</span>
        </div>
      )}

      {state.status === 'processing' && (
        <div className="processing-indicator">
          <span>处理中...</span>
        </div>
      )}

      {state.status === 'error' && state.message && (
        <div className="error-tooltip">
          {state.message}
        </div>
      )}

      {/* 波形动画 */}
      {state.status === 'recording' && (
        <div className="wave-animation">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="wave-bar"
              style={{
                animationDelay: `${i * 0.1}s`
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default FloatBall
