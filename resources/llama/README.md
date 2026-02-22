# llama.cpp Binaries

本目录存放 llama.cpp 可执行文件，用于本地 LLM 推理。

## 需要的文件

### Windows (x64)
- `llama-server.exe` - CPU 版本
- `llama-server-cuda.exe` - CUDA 版本（可选，用于 NVIDIA GPU 加速）

### macOS
- `llama-server` - 通用二进制（支持 Metal 加速）

### Linux
- `llama-server` - CPU 版本
- `llama-server-cuda` - CUDA 版本（可选）

## 如何获取

### 方法 1: 下载预编译版本

从 llama.cpp GitHub Releases 下载:
https://github.com/ggerganov/llama.cpp/releases

选择对应平台的版本:
- Windows: `llama-*-win-x64.zip`
- macOS: `llama-*-macos-arm64.zip` 或 `llama-*-macos-x64.zip`
- Linux: `llama-*-linux-x64.zip`

解压后将 `llama-server` (或 `llama-server.exe`) 复制到此目录。

### 方法 2: 从源码编译

```bash
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp

# CPU 版本
cmake -B build
cmake --build build --config Release

# CUDA 版本 (需要 CUDA Toolkit)
cmake -B build-cuda -DLLAMA_CUBLAS=ON
cmake --build build-cuda --config Release
```

编译后将 `build/bin/llama-server` 复制到此目录。

## 目录结构

```
resources/llama/
├── README.md
├── llama-server.exe       # Windows CPU 版本
├── llama-server-cuda.exe  # Windows CUDA 版本（可选）
└── llama-server           # macOS/Linux 版本
```

## 注意事项

1. CUDA 版本需要安装 NVIDIA 驱动和 CUDA 运行时
2. macOS 版本自动支持 Metal 加速
3. 确保文件有执行权限 (macOS/Linux: `chmod +x llama-server`)
