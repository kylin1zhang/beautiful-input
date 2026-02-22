# 本地 LLM 功能设计

## 概述

实现本地 LLM 功能，允许用户在完全离线的情况下使用 AI 文本处理。基于 llama.cpp 提供 OpenAI 兼容的 API，支持多后端（CPU、NVIDIA CUDA、Apple Metal）。

## 技术选型

**llama.cpp** - 轻量级本地推理引擎
- 提供 `llama-server` HTTP 服务
- 完全兼容 OpenAI `/v1/chat/completions` 端点
- 支持 GGUF 量化模型
- 与 Whisper.cpp 打包方式一致

参考：[LocalAI](https://github.com/mudler/LocalAI)、[llama.cpp](https://github.com/ggerganov/llama.cpp)

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     BeautifulInput 应用                      │
├─────────────────────────────────────────────────────────────┤
│  local-llm 模块                                             │
│  ├── index.ts                    # 模块入口                 │
│  ├── process-manager.ts          # llama.cpp 进程管理       │
│  ├── downloader.ts               # 模型下载器               │
│  ├── hardware-detector.ts        # 硬件检测，选择最佳后端    │
│  └── model-configs.ts            # 内置模型配置              │
├─────────────────────────────────────────────────────────────┤
│  resources/llama/                                           │
│  ├── llama-server.exe        # Windows CPU                  │
│  ├── llama-server-cuda.exe   # Windows NVIDIA               │
│  ├── llama-server            # macOS (Metal 自动启用)        │
│  └── llama-server            # Linux CPU                    │
└─────────────────────────────────────────────────────────────┘
```

## 内置模型配置

```typescript
export interface LocalLLMModel {
  id: string
  name: string
  description: string
  url: string           // HuggingFace 下载地址
  mirrorUrls?: string[] // 国内镜像
  sizeBytes: number
  sizeDisplay: string
  ramRequired: number   // MB
  gpuRecommended: boolean
  recommended: boolean
}

export const LOCAL_LLM_MODELS: LocalLLMModel[] = [
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    name: 'Qwen2.5 1.5B',
    description: '轻量级，适合低配设备',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    mirrorUrls: ['https://hf-mirror.com/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'],
    sizeBytes: 1.1 * 1024 * 1024 * 1024,
    sizeDisplay: '1.1 GB',
    ramRequired: 2048,
    gpuRecommended: false,
    recommended: true
  },
  {
    id: 'qwen2.5-3b-instruct-q4_k_m',
    name: 'Qwen2.5 3B',
    description: '平衡性能与效果',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    mirrorUrls: ['https://hf-mirror.com/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf'],
    sizeBytes: 2.0 * 1024 * 1024 * 1024,
    sizeDisplay: '2.0 GB',
    ramRequired: 4096,
    gpuRecommended: false,
    recommended: false
  },
  {
    id: 'phi-3.5-mini-instruct-q4_k_m',
    name: 'Phi-3.5 Mini',
    description: '微软出品，多语言支持好',
    url: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf',
    mirrorUrls: ['https://hf-mirror.com/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf'],
    sizeBytes: 2.2 * 1024 * 1024 * 1024,
    sizeDisplay: '2.2 GB',
    ramRequired: 4096,
    gpuRecommended: false,
    recommended: false
  },
  {
    id: 'qwen2.5-7b-instruct-q4_k_m',
    name: 'Qwen2.5 7B',
    description: '最佳效果，需要较好硬件',
    url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
    mirrorUrls: ['https://hf-mirror.com/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf'],
    sizeBytes: 4.7 * 1024 * 1024 * 1024,
    sizeDisplay: '4.7 GB',
    ramRequired: 8192,
    gpuRecommended: true,
    recommended: false
  }
]
```

## 硬件检测与后端选择

```typescript
export interface LLMHardwareInfo {
  platform: 'win32' | 'darwin' | 'linux'
  hasNvidia: boolean
  nvidiaGpuName?: string
  vram?: number          // MB
  isAppleSilicon: boolean
  totalMemory: number    // GB
  recommendedBackend: 'cpu' | 'cuda' | 'metal'
  recommendedModel: string  // 推荐的模型 ID
}
```

**检测逻辑：**
1. 检测总内存
2. macOS: 检测是否为 Apple Silicon (`sysctl -n machdep.cpu.brand_string`)
3. Windows/Linux: 检测 NVIDIA GPU (`nvidia-smi`)
4. 根据硬件配置推荐模型

**后端选择规则：**
- Apple Silicon → Metal 后端
- NVIDIA GPU → CUDA 后端
- 其他 → CPU 后端

## 进程管理

```typescript
export class LLMProcessManager {
  /**
   * 获取对应平台的可执行文件路径
   */
  private getExecutablePath(backend: 'cpu' | 'cuda' | 'metal'): string {
    const platform = process.platform
    const resourceDir = this.getResourceDir()

    if (platform === 'win32') {
      if (backend === 'cuda') {
        return join(resourceDir, 'llama-server-cuda.exe')
      }
      return join(resourceDir, 'llama-server.exe')
    }

    // macOS/Linux 单一 binary
    return join(resourceDir, 'llama-server')
  }

  /**
   * 启动 llama-server
   */
  async startServer(
    modelPath: string,
    backend: 'cpu' | 'cuda' | 'metal',
    options: { threads?: number; gpuLayers?: number } = {}
  ): Promise<number>
}
```

**启动参数：**
```bash
llama-server \
  -m <model_path> \
  --port 8765 \
  --host 127.0.0.1 \
  -c 4096 \
  -t 4 \              # CPU 线程数
  -ngl 35             # GPU 层数（CPU 为 0）
```

## 模型下载器

```typescript
export class LLMModelDownloader extends EventEmitter {
  /**
   * 下载模型
   * - 尝试主地址和镜像
   * - 支持进度回调
   * - 支持取消下载
   */
  async downloadModel(model: LocalLLMModel, modelsDir: string): Promise<string>

  /**
   * 取消下载
   */
  cancelDownload(modelId: string): void
}
```

**下载流程：**
1. 检查模型是否已存在
2. 尝试主下载地址
3. 失败后尝试镜像地址
4. 发送进度事件

## 设置界面

```
┌─────────────────────────────────────────────────────────────┐
│ 本地 LLM 设置                                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 硬件检测                                                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 检测结果：NVIDIA RTX 3060 (6GB)                         │ │
│ │ 推荐后端：CUDA                                           │ │
│ │ 推荐模型：Qwen2.5 3B                                     │ │
│ │                                           [重新检测]     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 可用模型                                                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ○ Qwen2.5 1.5B (推荐)        1.1 GB    [已下载]         │ │
│ │   轻量级，适合低配设备                                   │ │
│ │                                                          │ │
│ │ ○ Qwen2.5 3B                 2.0 GB    [下载]           │ │
│ │   平衡性能与效果                                         │ │
│ │                                                          │ │
│ │ ○ Phi-3.5 Mini               2.2 GB    [下载]           │ │
│ │   微软出品，多语言支持好                                 │ │
│ │                                                          │ │
│ │ ○ Qwen2.5 7B                 4.7 GB    [下载]           │ │
│ │   最佳效果，推荐 GPU                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 高级设置                                                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ CPU 线程数：[    4    ]                                  │ │
│ │ GPU 层数：  [   35    ]  (0 = 禁用 GPU)                  │ │
│ │ 服务端口：  [  8765   ]                                  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 模型存储位置                                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ C:\Users\xxx\AppData\userData\models\llm                │ │
│ │                                           [更改位置]     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## IPC 通道

```typescript
export enum IpcChannels {
  // 本地 LLM 相关（已定义）
  GET_LOCAL_LLM_MODELS = 'get-local-llm-models',
  DOWNLOAD_LOCAL_LLM_MODEL = 'download-local-llm-model',
  DELETE_LOCAL_LLM_MODEL = 'delete-local-llm-model',
  GET_LOCAL_LLM_STATUS = 'get-local-llm-status',
  LOCAL_LLM_DOWNLOAD_PROGRESS = 'local-llm-download-progress',

  // 新增
  DETECT_LLM_HARDWARE = 'detect-llm-hardware',
  START_LOCAL_LLM = 'start-local-llm',
  STOP_LOCAL_LLM = 'stop-local-llm',
}
```

## 数据流

```
用户选择本地 LLM
      │
      ▼
┌─────────────────┐
│ 检测硬件        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     未下载
│ 检查模型是否已下载├─────────────▶ 显示下载按钮
└────────┬────────┘
         │已下载
         ▼
┌─────────────────┐
│ 启动 llama-server│
│ (选择对应后端)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 等待服务就绪    │
│ (GET /health)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ LocalLLMProvider│
│ 调用 localhost   │
│ /v1/chat/...    │
└─────────────────┘
```

## 文件结构

```
src/main/modules/local-llm/
├── index.ts                    # 模块入口，整合所有功能
├── process-manager.ts          # llama.cpp 进程管理
├── downloader.ts               # 模型下载器
├── hardware-detector.ts        # 硬件检测
└── model-configs.ts            # 内置模型配置

resources/llama/
├── llama-server.exe            # Windows CPU
├── llama-server-cuda.exe       # Windows CUDA
├── llama-server                # macOS (Universal)
└── llama-server                # Linux CPU
```

## 与现有代码的集成

1. **LocalLLMProvider** 已在 `src/main/modules/ai-processor/providers/local-llm.ts` 创建基础框架
2. **providerRegistry** 已注册 'local' 提供商
3. **设置界面** 已有本地 LLM 选项入口

需要完成的工作：
- 完善 LocalLLMModule 实现
- 添加硬件检测逻辑
- 实现模型下载器
- 完善 UI 界面
- 打包 llama.cpp 可执行文件

## 打包配置

需要在 electron-builder 配置中添加：

```json
{
  "extraResources": [
    {
      "from": "resources/llama",
      "to": "llama",
      "filter": ["**/*"]
    }
  ]
}
```

## 测试计划

1. **硬件检测测试**
   - 测试各种硬件配置的检测准确性
   - 验证后端选择逻辑

2. **模型下载测试**
   - 测试主地址和镜像切换
   - 测试断点续传（可选）
   - 测试取消下载

3. **服务启动测试**
   - 测试各后端的启动参数
   - 测试服务就绪检测
   - 测试服务停止和重启

4. **推理测试**
   - 测试 AI 文本处理功能
   - 测试与云端 API 的结果对比
