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
- **Float Ball** (80x80px, transparent, frameless): draggable recording control
- **Settings Window**: Configuration panel
- **History Window**: Past recordings viewer

Windows are created on-demand and destroyed when closed (except float ball which persists).

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
- Uses `-webkit-app-region: drag` CSS on the container
- Icon uses `-webkit-app-region: no-drag` + `pointer-events: none` to remain clickable

### UI Notes

- The float ball must have no `box-shadow` (causes square border on Windows)
- Background must be fully transparent (`backgroundColor: '#00000000'` in window config)
- All window positions persist in electron-store

## Testing Notes

The app requires:
- FFmpeg to be installed and available in PATH (for audio recording)
- Valid Groq API Key for speech recognition
- Valid Qwen or DeepSeek API Key for text processing

Default ports: dev server on 5173. If port conflicts occur, kill the process with `taskkill //F //PID <pid>`.
