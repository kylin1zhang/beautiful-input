# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BeautifulInput is an AI-powered voice-to-text desktop application built with Electron. It records speech, transcribes it using Groq Whisper API, processes the text with Qwen/DeepSeek AI to remove colloquialisms, and automatically types the cleaned text at the cursor position.

## Development Commands

```bash
# Start development server (with hot reload)
npm run dev

# Build for production
npm run build

# Build for specific platforms
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Architecture

### Electron Process Structure

The app uses electron-vite for development and building, with three separate processes:

1. **Main Process** (`src/main/index.ts`): Entry point, creates windows, manages modules
2. **Preload Script** (`src/main/preload.ts`): Bridges main and renderer via contextBridge
3. **Renderer Process** (`src/renderer/`): React UI for float ball, settings, history windows

### Module System

The main process uses a modular architecture. Each core feature is encapsulated in a module under `src/main/modules/`:

- **recording**: Audio capture via FFmpeg
- **transcription**: Speech recognition via Groq Whisper API
- **ai-processor**: Text processing via Qwen/DeepSeek API
- **input-simulator**: Keyboard simulation via nut-js (with clipboard fallback for Chinese text)
- **settings**: User configuration persistence via electron-store
- **shortcuts**: Global hotkey registration
- **history**: Recording history management

Services are under `src/main/services/` for external API integrations (Groq, Qwen, DeepSeek, store).

### Multi-Window System

The app manages multiple BrowserWindows:
- **Float Ball** (41x41px, transparent, frameless): draggable recording control
- **Settings Window**: Configuration panel
- **History Window**: Past recordings viewer

Windows are created on-demand and destroyed when closed (except float ball which persists).

### Float Ball Interaction

悬浮球采用分层交互模式：
- **拖动**: 点击悬浮球边缘区域（非图标部分）可拖动
- **录音**: 点击中间麦克风图标开始/停止录音
- **右键**: 右键点击打开设置窗口
- **快捷键**: `Alt+Shift+O` 开始/停止录音，`Alt+Shift+T` 快速翻译

技术实现：
- 使用 `-webkit-app-region: drag` CSS 属性实现窗口拖动
- 使用 `-webkit-app-region: no-drag` 让图标区域可点击
- 悬浮球位置保存在 electron-store，启动时恢复上次位置
- 边界约束确保悬浮球不会被拖出屏幕可视区域

### Path Aliases

Use these aliases for imports:
- `@/` → `src/`
- `@main/` → `src/main/`
- `@renderer/` → `src/renderer/`
- `@shared/` → `src/shared/`

### IPC Communication

All IPC channels are defined in `IpcChannels` enum in `@shared/types/index.ts`. The preload script exposes a typed `electronAPI` object to the renderer process via contextBridge.

### Critical Design Patterns

**Input Simulator** (`input-simulator` module):
- Detects Chinese text (character ratio > 30%) and uses clipboard paste for instant input
- English/mixed text uses nut-js for character-by-character typing
- Clipboard is saved once before input and restored after to avoid disrupting user's clipboard

**Error Handling** in `main/index.ts`:
- When errors occur, status is set to 'error' first, then back to 'idle' after 3 seconds
- Error messages are localized for common issues (API key not configured, network errors, etc.)

**Float Ball Dragging**:
- 分层设计：背景层（drag-area）可拖动，图标层（click-area）可点击
- CSS 实现：`.drag-area { -webkit-app-region: drag }` 和 `.click-area { -webkit-app-region: no-drag }`
- 尺寸：悬浮球 41x41px，点击区域 28x28px

### UI Notes

- 悬浮球颜色：统一使用渐变 `linear-gradient(135deg, #6366F1, #8B5CF6)`
- 悬浮球必须有 no `box-shadow`（Windows 上会导致方形边框）
- 背景必须完全透明（`backgroundColor: '#00000000'`）
- 所有窗口位置持久化到 electron-store

### Voice Activity Detection (VAD)

录音模块包含 VAD 自动停止功能：
- 实时监测音频能量，检测静音片段
- 默认配置：静音阈值 0.01，静音时长 3.5 秒后自动停止
- 用户可在设置中启用/禁用 VAD 自动停止
- 配置项：`vadEnabled`、`vadSilenceThreshold`、`vadSilenceDuration`

### Components

- **MicIcon** (`src/renderer/components/MicIcon.tsx`): 自定义麦克风 SVG 图标组件
  - 支持自定义 size 和 className
  - 颜色通过 CSS `currentColor` 继承

## Testing Notes

The app requires:
- FFmpeg to be installed and available in PATH (for audio recording)
- Valid Groq API Key for speech recognition
- Valid Qwen or DeepSeek API Key for text processing

Default ports: dev server on 5173. If port conflicts occur, kill the process with `taskkill //F //PID <pid>`.
