# BeautifulInput

AI 语音输入工具 - 将口语化语言整理成条理清晰的文字

## 功能特性

- 🎙️ **语音录制** - 点击悬浮球或使用快捷键开始/停止录音
- 🤖 **智能识别** - 使用 Groq Whisper API 进行语音识别
- ✨ **AI 处理** - 使用 Qwen/DeepSeek API 去除口语化、格式化文本
- ⌨️ **自动输入** - 将处理后的文本自动插入光标位置
- 🌐 **中英混说** - 准确识别中英文混合语音
- 📚 **历史记录** - 保存和管理所有处理记录
- ⚡ **全局快捷键** - 可自定义的快捷键系统
- 🎨 **个性化设置** - 支持多种语调风格和个人词典
- 🔵 **悬浮球** - 可拖动的悬浮控制球，支持边界限制

## 交互说明

### 悬浮球操作

| 操作 | 功能 |
|------|------|
| 点击中间图标 | 开始/停止录音 |
| 拖动边缘区域 | 移动悬浮球位置 |
| 右键点击 | 打开设置窗口 |

### 快捷键

- `Alt+Shift+O` - 开始/停止录音
- `Alt+Shift+T` - 快速翻译

## 技术栈

- **框架**: Electron + TypeScript + React
- **状态管理**: Zustand
- **语音识别**: Groq Whisper API
- **AI 处理**: Qwen/DeepSeek API
- **输入模拟**: nut-js
- **本地存储**: electron-store

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

```bash
# 构建所有平台
npm run build

# 构建特定平台
npm run build:win
npm run build:mac
npm run build:linux
```

### 打包发布

```bash
npm run dist
```

## 项目结构

```
beautiful-input/
├── src/
│   ├── main/              # 主进程
│   │   ├── index.ts       # 主进程入口
│   │   ├── preload.ts     # 预加载脚本
│   │   ├── modules/       # 功能模块
│   │   │   ├── recording/     # 录音模块
│   │   │   ├── transcription/ # 语音识别模块
│   │   │   ├── ai-processor/  # AI 处理模块
│   │   │   ├── input-simulator/ # 输入模拟模块
│   │   │   ├── settings/      # 设置模块
│   │   │   ├── shortcuts/     # 快捷键模块
│   │   │   └── history/       # 历史记录模块
│   │   └── services/      # 服务层
│   │       ├── groq.service.ts
│   │       ├── qwen.service.ts
│   │       ├── deepseek.service.ts
│   │       └── store.service.ts
│   ├── renderer/          # 渲染进程
│   │   ├── components/    # React 组件
│   │   │   ├── FloatBall.tsx
│   │   │   ├── MicIcon.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── History.tsx
│   │   ├── float.tsx      # 悬浮球入口
│   │   ├── settings.tsx   # 设置窗口入口
│   │   └── history.tsx    # 历史记录窗口入口
│   └── shared/            # 共享代码
│       ├── types/         # TypeScript 类型
│       ├── constants/     # 常量定义
│       └── utils/         # 工具函数
├── resources/             # 资源文件（图标等）
│   ├── icon.svg
│   └── icon-*.png
├── scripts/               # 构建脚本
│   └── generate-icon.js   # 图标生成脚本
└── build/                 # 构建输出
```

## 配置说明

### API Key 配置

1. **Groq API Key**: 用于语音识别
   - 访问 [Groq Console](https://console.groq.com) 获取
   - 在设置中输入 API Key

2. **Qwen API Key**: 用于 AI 文本处理（推荐）
   - 访问 [通义千问](https://dashscope.aliyun.com) 获取
   - 在设置中输入 API Key

3. **DeepSeek API Key**: 备选 AI 处理
   - 访问 [DeepSeek Platform](https://platform.deepseek.com) 获取
   - 在设置中输入 API Key

### 快捷键配置

默认快捷键：

- `Alt+Shift+O` - 开始/停止录音
- `Alt+Shift+T` - 快速翻译

可以在设置中自定义快捷键。

## 开发计划

### 第一阶段：MVP 核心功能 ✅
- [x] 项目搭建与基础架构
- [x] 录音模块
- [x] 语音识别模块
- [x] 基础 AI 处理
- [x] 简单输入输出
- [x] 基础 UI（悬浮球）

### 第二阶段：完善体验 ✅
- [x] AI 处理增强
- [x] 设置窗口与配置管理
- [x] 快捷键系统
- [x] 历史记录功能
- [x] 错误处理与提示
- [x] 自定义悬浮球图标
- [x] 悬浮球边界限制

### 第三阶段：高级功能
- [ ] AI 助手功能
- [ ] 个人词典
- [ ] 个性化语调
- [ ] 悬停菜单
- [ ] 性能优化

### 第四阶段：打磨与发布
- [ ] 完整测试覆盖
- [ ] 打包与签名
- [ ] 文档编写
- [ ] 发布准备

## 已知限制

- **Groq Whisper API**: 最大支持约 13 分钟的音频（25MB 限制）
- **长录音处理**: 超长录音可能需要分段处理（待实现）

## 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

[MIT](LICENSE)

## 致谢

- [Groq](https://groq.com) - 提供高速语音识别 API
- [Qwen](https://tongyi.aliyun.com) - 提供中文优化的 AI 处理 API
- [DeepSeek](https://deepseek.com) - 提供 AI 文本处理 API
- [Electron](https://electronjs.org) - 跨平台桌面应用框架
