# 资源文件

此目录存放应用所需的资源文件。

## 图标文件

需要准备以下图标文件：

### 应用图标

- `icon.png` - 主应用图标 (512x512 或 1024x1024)
- `icon.icns` - macOS 应用图标
- `icon.ico` - Windows 应用图标

### 托盘图标

- `tray-icon.png` - 系统托盘图标 (16x16 或 32x32)
- `tray-icon@2x.png` - 高分辨率托盘图标 (32x32 或 64x64)
- `tray-iconTemplate.png` - macOS 模板图标（用于深色模式）

## 生成图标

可以使用以下工具生成图标：

1. **在线工具**
   - [App Icon Generator](https://appicon.co/)
   - [Favicon.io](https://favicon.io/)

2. **命令行工具**
   ```bash
   # 使用 ImageMagick 生成不同尺寸的图标
   convert icon.png -resize 16x16 icon-16.png
   convert icon.png -resize 32x32 icon-32.png
   convert icon.png -resize 48x48 icon-48.png
   convert icon.png -resize 128x128 icon-128.png
   convert icon.png -resize 256x256 icon-256.png
   convert icon.png -resize 512x512 icon-512.png
   ```

3. **electron-icon-builder**
   ```bash
   npm install -g electron-icon-builder
   electron-icon-builder --input=./icon.png --output=./build
   ```

## 图标设计建议

- 使用简洁的设计，在小尺寸下也能清晰识别
- 使用透明背景（PNG 格式）
- 主色调建议使用蓝色系（#3B82F6）
- 包含麦克风或语音相关的视觉元素
