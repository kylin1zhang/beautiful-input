# Typeless 快速开始指南

## 环境要求

- **Node.js**: 18.0.0 或更高版本
- **npm**: 9.0.0 或更高版本
- **操作系统**: macOS 10.14+ / Windows 10+ / Linux (Ubuntu 18.04+)

## 快速开始

### 1. 进入项目目录

```bash
cd /mnt/okcomputer/output/typeless
```

### 2. 运行设置脚本

**macOS/Linux:**
```bash
./scripts/setup.sh
```

**Windows:**
```bash
scripts\setup.bat
```

或者手动安装：
```bash
npm install
```

### 3. 配置 API Keys

在使用前需要配置 API Keys：

1. **获取 Groq API Key**
   - 访问 https://console.groq.com
   - 注册账号
   - 创建 API Key

2. **获取 DeepSeek API Key**
   - 访问 https://platform.deepseek.com
   - 注册账号
   - 创建 API Key

3. **在应用中配置**
   - 启动应用后右键点击悬浮球
   - 选择"设置"
   - 在"API 配置"标签页中输入 API Keys
   - 点击"保存"

### 4. 启动开发模式

```bash
npm run dev
```

这将启动：
- Electron 主进程
- Vite 开发服务器
- 悬浮球窗口

### 5. 开始使用

**使用快捷键:**
- `Cmd/Ctrl + Shift + R` - 开始/停止录音

**使用悬浮球:**
- 点击悬浮球开始录音
- 再次点击停止录音

**使用系统托盘:**
- 点击系统托盘图标
- 选择"开始/停止录音"

## 可用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发模式 |
| `npm run build` | 构建应用 |
| `npm run build:win` | 构建 Windows 版本 |
| `npm run build:mac` | 构建 macOS 版本 |
| `npm run build:linux` | 构建 Linux 版本 |
| `npm run preview` | 预览构建结果 |
| `npm run lint` | 运行 ESLint 检查 |
| `npm run typecheck` | 运行 TypeScript 类型检查 |

## 项目结构

```
typeless/
├── src/
│   ├── main/              # 主进程代码
│   ├── renderer/          # 渲染进程代码
│   └── shared/            # 共享代码
├── docs/                  # 文档
├── resources/             # 资源文件
├── scripts/               # 脚本文件
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript 配置
└── electron.vite.config.ts # Vite 配置
```

## 功能特性

- 🎙️ **语音录制** - 一键开始/停止录音
- 🤖 **智能识别** - 使用 Groq Whisper API
- ✨ **AI 处理** - 使用 DeepSeek API 整理文本
- ⌨️ **自动输入** - 文本自动插入光标位置
- 🌐 **中英混说** - 准确识别中英文混合语音
- 📚 **历史记录** - 保存和管理处理记录
- ⚡ **全局快捷键** - 可自定义快捷键
- 🎨 **个性化设置** - 多种语调风格和个人词典

## 文档

- [用户指南](./docs/USER_GUIDE.md) - 详细的使用说明
- [开发指南](./docs/DEVELOPMENT.md) - 开发环境设置和架构说明
- [API 使用指南](./docs/API.md) - API Key 配置和费用说明
- [项目总结](./PROJECT_SUMMARY.md) - 项目完成总结

## 常见问题

### Q: 录音没有反应？
A: 请检查：
1. 麦克风权限是否已开启
2. 麦克风设备是否正常
3. 其他应用是否占用了麦克风

### Q: 识别结果不准确？
A: 建议：
1. 在安静的环境中使用
2. 放慢语速，清晰发音
3. 将专业术语添加到个人词典

### Q: 文本没有输入到目标应用？
A: 请检查：
1. 目标应用是否处于焦点状态
2. 辅助功能权限是否已开启（macOS）
3. 文本已复制到剪贴板，可以手动粘贴

### Q: API 错误？
A: 请检查：
1. API Key 是否正确
2. 网络连接是否正常
3. API 使用配额是否充足

## 获取帮助

- 📖 查看完整文档：[docs](./docs)
- 🐛 提交问题：[GitHub Issues](https://github.com/typeless-app/typeless/issues)

## 许可证

[MIT](LICENSE)
