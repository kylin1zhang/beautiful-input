# Typeless 开发指南

## 开发环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

## 开发环境设置

### 1. 克隆仓库

```bash
git clone https://github.com/typeless-app/typeless.git
cd typeless
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

创建 `.env` 文件：

```bash
# 开发模式
NODE_ENV=development

# API Keys（可选，也可以在应用中配置）
GROQ_API_KEY=your_groq_api_key
DEEPSEEK_API_KEY=your_deepseek_api_key
```

### 4. 启动开发服务器

```bash
npm run dev
```

这将启动：
- Electron 主进程
- Vite 开发服务器（渲染进程）
- 悬浮球窗口

## 项目架构

### 主进程 (Main Process)

主进程负责：
- 窗口管理（悬浮球、设置窗口、历史记录窗口）
- 系统托盘
- 全局快捷键
- 录音模块
- 与渲染进程的 IPC 通信

入口文件：`src/main/index.ts`

### 渲染进程 (Renderer Process)

渲染进程负责：
- UI 渲染
- 用户交互
- 调用主进程 API

入口文件：
- 悬浮球：`src/renderer/float.tsx`
- 设置窗口：`src/renderer/settings.tsx`
- 历史记录窗口：`src/renderer/history.tsx`

### 预加载脚本 (Preload Script)

预加载脚本负责：
- 安全地暴露主进程 API 到渲染进程
- 定义 IPC 通道

文件：`src/main/preload.ts`

## 模块说明

### 录音模块 (`src/main/modules/recording/`)

负责音频录制：
- 检查麦克风权限
- 录制音频
- 处理音频流

```typescript
const recording = new RecordingModule()
await recording.startRecording()
const audioBuffer = await recording.stopRecording()
```

### 语音识别模块 (`src/main/modules/transcription/`)

负责调用 Groq API 进行语音识别：
- 转换音频格式
- 调用 API
- 处理返回结果

```typescript
const transcription = new TranscriptionModule()
const result = await transcription.transcribe(audioBuffer, apiKey)
```

### AI 处理模块 (`src/main/modules/ai-processor/`)

负责调用 DeepSeek API 进行文本处理：
- 清理口语化表达
- 格式化文本
- 翻译
- AI 助手功能

```typescript
const processor = new AiProcessorModule()
const result = await processor.process(text, 'clean', apiKey)
```

### 输入模拟模块 (`src/main/modules/input-simulator/`)

负责模拟键盘输入：
- 模拟键盘输入
- 获取当前活动应用

```typescript
const input = new InputSimulatorModule()
await input.typeText(text)
```

## IPC 通信

### 通道定义

所有 IPC 通道定义在 `src/shared/types/index.ts`：

```typescript
export enum IpcChannels {
  START_RECORDING = 'start-recording',
  STOP_RECORDING = 'stop-recording',
  // ...
}
```

### 主进程发送消息

```typescript
// 向所有渲染进程发送
BrowserWindow.getAllWindows().forEach(window => {
  window.webContents.send(IpcChannels.RECORDING_STATUS_CHANGED, { status: 'recording' })
})

// 向特定窗口发送
floatWindow.webContents.send(IpcChannels.PROCESSING_RESULT, result)
```

### 渲染进程发送消息

```typescript
// 调用主进程方法
await window.electronAPI.startRecording()

// 监听主进程消息
window.electronAPI.onRecordingStatusChanged((event, data) => {
  console.log(data.status)
})
```

## 添加新功能

### 添加新的 IPC 通道

1. 在 `src/shared/types/index.ts` 添加通道：

```typescript
export enum IpcChannels {
  // ... 现有通道
  MY_NEW_CHANNEL = 'my-new-channel'
}
```

2. 在 `src/main/preload.ts` 暴露 API：

```typescript
myNewChannel: (data: MyData) => ipcRenderer.invoke(IpcChannels.MY_NEW_CHANNEL, data)
```

3. 在 `src/main/index.ts` 处理请求：

```typescript
ipcMain.handle(IpcChannels.MY_NEW_CHANNEL, async (event, data) => {
  // 处理逻辑
  return result
})
```

### 添加新的设置项

1. 在 `src/shared/types/index.ts` 更新类型：

```typescript
export interface UserSettings {
  // ... 现有设置
  myNewSetting: string
}
```

2. 在 `defaultSettings` 中添加默认值

3. 在设置组件中添加 UI

## 调试

### 主进程调试

```bash
# 使用 VS Code 调试
# 1. 在代码中添加断点
# 2. 按 F5 启动调试
```

### 渲染进程调试

```bash
# 开发模式下自动打开 DevTools
# 或按 Cmd/Ctrl + Shift + I 打开
```

### 日志

```typescript
// 主进程
console.log('[Main] 日志信息')

// 渲染进程
console.log('[Renderer] 日志信息')
```

## 测试

### 运行测试

```bash
# 单元测试
npm run test

# E2E 测试
npm run test:e2e
```

### 测试结构

```
tests/
├── unit/           # 单元测试
├── integration/    # 集成测试
└── e2e/            # E2E 测试
```

## 构建

### 开发构建

```bash
npm run build
```

### 生产构建

```bash
npm run build:prod
```

### 打包

```bash
# 所有平台
npm run dist

# 特定平台
npm run dist:win
npm run dist:mac
npm run dist:linux
```

## 发布

### 自动发布

使用 GitHub Actions 自动发布：

1. 创建标签
```bash
git tag v1.0.0
git push origin v1.0.0
```

2. GitHub Actions 将自动构建并发布

### 手动发布

```bash
# 1. 更新版本号
npm version patch|minor|major

# 2. 构建并打包
npm run build
npm run dist

# 3. 上传到 GitHub Releases
```

## 常见问题

### 录音权限问题

**macOS**: 
- 需要在系统设置中授予麦克风权限
- 首次运行时会弹出权限请求

**Windows**:
- 确保麦克风设备已启用
- 检查隐私设置中的麦克风权限

**Linux**:
- 确保用户属于 `audio` 组
- 安装必要的音频驱动

### 输入模拟问题

**macOS**:
- 需要在系统设置中授予辅助功能权限
- 路径：系统设置 > 隐私与安全 > 辅助功能

**Windows**:
- 以管理员身份运行应用

### API 错误

- 检查 API Key 是否正确
- 检查网络连接
- 查看 API 使用配额

## 贡献指南

1. Fork 本仓库
2. 创建特性分支
3. 提交更改
4. 创建 Pull Request

### 代码规范

- 使用 TypeScript
- 遵循 ESLint 规则
- 编写清晰的提交信息
- 添加必要的注释

### 提交信息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

类型：
- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档
- `style`: 格式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

## 相关资源

- [Electron 文档](https://electronjs.org/docs)
- [React 文档](https://react.dev)
- [TypeScript 文档](https://typescriptlang.org/docs)
- [Groq API 文档](https://console.groq.com/docs)
- [DeepSeek API 文档](https://platform.deepseek.com/docs)
