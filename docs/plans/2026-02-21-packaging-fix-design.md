# Electron 打包配置完善设计

## 问题描述

Electron 打包时图标和资源文件没有正确包含在安装包中。

## 问题分析

当前打包配置存在以下问题：

| 问题 | 说明 |
|------|------|
| 缺少 `.ico` 文件 | Windows 安装程序和可执行文件需要 ico 格式图标 |
| 缺少 `.icns` 文件 | macOS 应用需要 icns 格式图标 |
| 未配置图标路径 | electron-builder 的 win/mac 配置中没有指定 icon |

## 解决方案

### 1. 图标文件生成

从现有 `resources/icon.png`（512x512）生成平台专用图标：

- **Windows**: `resources/icon.ico` - 包含 16/32/48/64/128/256 多尺寸
- **macOS**: `resources/icon.icns` - 包含 16/32/64/128/256/512 多尺寸

### 2. 更新 electron-builder 配置

在 `package.json` 的 build 配置中指定各平台图标路径：

```json
{
  "build": {
    "win": {
      "icon": "resources/icon.ico",
      "target": [{ "target": "nsis", "arch": ["x64"] }]
    },
    "mac": {
      "icon": "resources/icon.icns",
      "target": [{ "target": "dmg", "arch": ["x64", "arm64"] }]
    }
  }
}
```

### 3. 资源文件确认

| 资源 | 打包位置 | 说明 |
|------|----------|------|
| Whisper 程序 (Windows) | `process.resourcesPath/whisper/` | 通过 extraResources 配置 |
| PNG 图标 | 打包到 app.asar | 通过 files 配置 |
| ico/icns 图标 | electron-builder 自动处理 | 用于安装程序和应用图标 |

## 实现步骤

1. 安装图标生成依赖 (`png-to-ico`, `icns-lib` 或类似库)
2. 创建图标生成脚本
3. 生成 icon.ico 和 icon.icns 文件
4. 更新 package.json 的 build 配置
5. 执行打包测试验证

## 注意事项

- macOS icns 生成可能需要特定工具，Windows 上可能需要使用替代方案
- 如果在 Windows 上无法生成 icns，可以先生成 ico，macOS 图标后续处理
