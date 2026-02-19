import React from 'react'
import ReactDOM from 'react-dom/client'

// 主窗口应用
const App: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      textAlign: 'center',
      padding: '40px'
    }}>
      <h1 style={{
        fontSize: '48px',
        fontWeight: 'bold',
        marginBottom: '20px'
      }}>
        Typeless
      </h1>
      <p style={{
        fontSize: '20px',
        opacity: 0.9,
        marginBottom: '40px'
      }}>
        AI 语音输入工具
      </p>
      <div style={{
        display: 'flex',
        gap: '16px',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        <button
          onClick={() => window.electronAPI.showSettings()}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            background: 'white',
            color: '#667eea',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            transition: 'transform 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          打开设置
        </button>
        <button
          onClick={() => window.electronAPI.showHistory()}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            background: 'transparent',
            color: 'white',
            border: '2px solid white',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'white'
            e.currentTarget.style.color = '#667eea'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'white'
          }}
        >
          查看历史
        </button>
      </div>
      <p style={{
        marginTop: '40px',
        fontSize: '14px',
        opacity: 0.7
      }}>
        使用快捷键 CommandOrControl+Shift+R 开始录音
      </p>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
