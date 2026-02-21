# 本地语音识别功能设计文档

## 概述

为 BeautifulInput 添加本地语音识别功能，支持用户在本地运行 Whisper 模型进行语音转文字，避免跨国 API 调用的网络延迟，实现更快的响应速度。

## 需求背景

### 当前问题
- 语音转文字依赖 Groq Whisper API
- 跨国网络通信导致延迟较高
- 无法在离线环境下使用语音转文字功能

### 目标
- 提供本地语音识别选项，减少延迟
- 支持混合硬件配置（CPU/GPU/Mac）
- 面向普通用户，一键安装使用
- 语音转文字完全离线运行
- 优先识别准确率（可接受较大模型）

## 技术方案

### 选型：Whisper.cpp

选择 Whisper.cpp 作为本地推理引擎：
- 单一可执行文件，无需 Python 环境
- 支持所有平台（Windows/macOS/Linux）
- 支持 CPU、CUDA GPU、Apple Metal 加速
- 模型丰富：tiny → base → small → medium → large-v3
- 活跃维护，社区成熟

### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    BeautifulInput                        │
├─────────────────────────────────────────────────────────┤
│  设置窗口新增「语音识别引擎」配置页                        │
│  ├─ 引擎选择：Groq API / 本地模型                        │
│  └─ 本地模型设置：                                        │
│      ├─ 自动检测硬件（GPU/CPU/Mac）                      │
│      ├─ 推荐模型（根据硬件自动推荐）                      │
│      ├─ 模型下载/管理                                    │
│      └─ 性能测试按钮                                     │
├─────────────────────────────────────────────────────────┤
│  本地模块（新增）                                         │
│  ├─ hardware-detector: 检测 GPU/CPU/Mac 芯片             │
│  ├─ model-manager: 模型下载、版本管理                     │
│  └─ local-transcriber: 调用 whisper.cpp 进行转录         │
├─────────────────────────────────────────────────────────┤
│  资源文件                                                 │
│  ├─ whisper-cuda.exe    (NVIDIA GPU 版本)                │
│  ├─ whisper.exe         (纯 CPU 版本)                    │
│  └─ models/             (用户下载的模型，按需下载)        │
│      ├─ ggml-base.bin   (142MB)                          │
│      ├─ ggml-small.bin  (466MB)                          │
│      ├─ ggml-medium.bin (1.5GB)                          │
│      └─ ggml-large-v3.bin (2.9GB)                        │
└─────────────────────────────────────────────────────────┘
```

### 硬件检测逻辑

首次启动或用户点击「自动检测」时：
1. 检测操作系统（Windows/macOS/Linux）
2. 检测 GPU（NVIDIA 显卡或 Apple Silicon）
3. 获取显存/内存大小
4. 返回硬件配置并推荐合适的模型

### 模型推荐策略

| 硬件配置 | 推荐模型 | 模型大小 | 预期性能 |
|---------|---------|---------|---------|
| NVIDIA GPU (8GB+ 显存) | large-v3 | 2.9GB | ~0.5s 处理 10s 音频 |
| NVIDIA GPU (4-8GB 显存) | medium | 1.5GB | ~1s 处理 10s 音频 |
| Apple Silicon M1/M2/M3 | medium | 1.5GB | ~1s 处理 10s 音频 |
| 仅 CPU + 16GB+ 内存 | small | 466MB | ~3s 处理 10s 音频 |
| 仅 CPU + 8-16GB 内存 | base | 142MB | ~5s 处理 10s 音频 |

### 模型下载策略

下载源优先级：
1. Hugging Face Mirror（hf-mirror.com，国内可用）
2. Hugging Face 官方
3. GitHub Releases（备用）

下载流程：
1. 用户点击「下载」
2. 显示下载进度条（速度和剩余时间）
3. 下载完成后校验文件完整性（SHA256）
4. 提示用户可以进行「性能测试」

### 打包的可执行文件

| 平台 | 文件 | 大小 | 说明 |
|------|-----|------|------|
| Windows | whisper-cuda.exe | ~5MB | NVIDIA GPU 版本 |
| Windows | whisper.exe | ~4MB | 纯 CPU 版本 |
| macOS | whisper-metal | ~5MB | Apple Silicon 优化版 |
| macOS | whisper | ~4MB | Intel Mac 版本 |
| Linux | whisper-cuda | ~5MB | NVIDIA GPU 版本 |
| Linux | whisper | ~4MB | 纯 CPU 版本 |

## 用户界面设计

### 设置窗口新增内容

```
┌─────────────────────────────────────────────────────────┐
│  语音识别设置                                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  识别引擎  ○ Groq API (云端)  ● 本地模型 (离线)          │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  本地模型设置                                             │
│                                                         │
│  硬件检测                                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 检测结果：NVIDIA RTX 3060 (12GB)                │   │
│  │ 推荐模型：large-v3                              │   │
│  │                                      [重新检测]  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  模型选择                                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ○ base    (142MB)  - 快速，适合低配置电脑        │   │
│  │ ○ small   (466MB)  - 平衡速度与准确率           │   │
│  │ ● medium  (1.5GB)  - 高准确率 [已下载] ✓        │   │
│  │ ○ large-v3(2.9GB)  - 最高准确率，需 GPU         │   │
│  │                                                  │   │
│  │ [下载选中模型]  [删除模型]  [性能测试]           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  高级选项                                                │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 语言：[自动检测 ▼]  或  [中文 ▼]  或  [英文 ▼]   │   │
│  │ 线程数：[4 ▼]  (CPU 模式下生效)                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 处理流程变化

### 当前流程（Groq API）
```
录音 → 保存 WAV → 上传 Groq → 等待返回 → AI 处理 → 输入文字
        ↑                    ↑
        本地              跨国网络延迟
```

### 新流程（本地模型）
```
录音 → 保存 WAV → 本地 Whisper.cpp → AI 处理 → 输入文字
        ↑              ↑
        本地         本地计算（无网络延迟）
```

## 模块设计

### 新增模块

1. **hardware-detector** (`src/main/modules/hardware-detector/`)
   - 检测操作系统
   - 检测 NVIDIA GPU（Windows/Linux）
   - 检测 Apple Silicon（macOS）
   - 获取显存/内存信息

2. **model-manager** (`src/main/modules/model-manager/`)
   - 模型列表管理
   - 模型下载（支持断点续传）
   - 模型删除
   - 文件完整性校验

3. **local-transcriber** (`src/main/modules/local-transcriber/`)
   - 调用 whisper.cpp 可执行文件
   - 解析输出结果
   - 错误处理

### 修改模块

1. **settings** - 添加本地模型相关配置项
2. **transcription** - 支持选择 API 或本地转录
3. **IPC 通道** - 新增本地模型相关的 IPC 通信

## 配置项新增

```typescript
interface LocalWhisperSettings {
  // 识别引擎选择
  engine: 'groq' | 'local';

  // 本地模型配置
  localModel: {
    selectedModel: 'base' | 'small' | 'medium' | 'large-v3';
    language: 'auto' | 'zh' | 'en' | ...;
    threads: number;  // CPU 线程数
    useGpu: boolean;  // 是否使用 GPU
  };

  // 硬件检测结果（缓存）
  hardwareInfo: {
    platform: string;
    hasNvidia: boolean;
    nvidiaGpuName?: string;
    vram?: number;
    isAppleSilicon: boolean;
    memory: number;
  };
}
```

## 风险与应对

1. **模型下载失败**
   - 提供多个下载源
   - 支持断点续传
   - 允许用户手动下载后指定路径

2. **GPU 兼容性问题**
   - 提供纯 CPU 版本作为备选
   - 自动检测并回退到 CPU 模式

3. **内存不足**
   - 根据内存大小推荐合适模型
   - 运行前检查可用内存

4. **模型文件损坏**
   - SHA256 校验
   - 自动重新下载损坏的模型

## 后续扩展

- 支持更多模型（如 Distil-Whisper）
- 支持自定义模型路径
- 流式转录（边说边转）
- 多语言自动检测优化
