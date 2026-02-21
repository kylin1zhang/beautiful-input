# Whisper.cpp 可执行文件

此目录用于存放 Whisper.cpp 可执行文件，用于本地语音识别。

## 需要的可执行文件

从 [Whisper.cpp Releases](https://github.com/ggerganov/whisper.cpp/releases) 下载对应平台的可执行文件：

### Windows
- `whisper.exe` - CPU 版本
- `whisper-cuda.exe` - NVIDIA GPU 加速版本

### macOS
- `whisper` - CPU 版本
- `whisper-metal` - Apple Silicon GPU 加速版本

### Linux
- `whisper` - CPU 版本
- `whisper-cuda` - NVIDIA GPU 加速版本

## 下载步骤

1. 访问 https://github.com/ggerganov/whisper.cpp/releases
2. 下载最新版本的 `whisper-<platform>-<arch>.zip`
3. 解压后将可执行文件放入此目录
4. 确保文件有执行权限（Linux/macOS）

## 注意事项

- 可执行文件不会提交到 Git 仓库
- 打包时需要手动下载并放置对应平台的可执行文件
- 用户也可以自行编译 Whisper.cpp
