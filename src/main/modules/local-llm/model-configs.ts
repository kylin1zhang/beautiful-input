// src/main/modules/local-llm/model-configs.ts

import { LocalLLMModel } from '@shared/types/index.js'

/**
 * 内置本地 LLM 模型配置
 */
export const LOCAL_LLM_MODELS: LocalLLMModel[] = [
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    name: 'Qwen2.5 1.5B',
    description: '轻量级，适合低配设备',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: '1.1 GB',
    sizeBytes: 1.1 * 1024 * 1024 * 1024,
    ramRequired: '2 GB',
    mirrorUrls: [
      'https://hf-mirror.com/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
    ],
    recommended: true,
    gpuRecommended: false
  },
  {
    id: 'qwen2.5-3b-instruct-q4_k_m',
    name: 'Qwen2.5 3B',
    description: '平衡性能与效果',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    size: '2.0 GB',
    sizeBytes: 2.0 * 1024 * 1024 * 1024,
    ramRequired: '4 GB',
    mirrorUrls: [
      'https://hf-mirror.com/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf'
    ],
    recommended: false,
    gpuRecommended: false
  },
  {
    id: 'phi-3.5-mini-instruct-q4_k_m',
    name: 'Phi-3.5 Mini',
    description: '微软出品，多语言支持好',
    url: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf',
    size: '2.2 GB',
    sizeBytes: 2.2 * 1024 * 1024 * 1024,
    ramRequired: '4 GB',
    mirrorUrls: [
      'https://hf-mirror.com/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf'
    ],
    recommended: false,
    gpuRecommended: false
  },
  {
    id: 'qwen2.5-7b-instruct-q4_k_m',
    name: 'Qwen2.5 7B',
    description: '最佳效果，需要较好硬件',
    url: 'https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf',
    size: '4.7 GB',
    sizeBytes: 4.7 * 1024 * 1024 * 1024,
    ramRequired: '8 GB',
    mirrorUrls: [
      'https://hf-mirror.com/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf'
    ],
    recommended: false,
    gpuRecommended: true
  }
]

/**
 * 国内镜像地址（保留兼容）
 */
export const LOCAL_LLM_MIRROR_URLS: Record<string, string[]> = {
  'qwen2.5-1.5b-instruct-q4_k_m': [
    'https://hf-mirror.com/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
  ],
  'qwen2.5-3b-instruct-q4_k_m': [
    'https://hf-mirror.com/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf'
  ],
  'phi-3.5-mini-instruct-q4_k_m': [
    'https://hf-mirror.com/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf'
  ],
  'qwen2.5-7b-instruct-q4_k_m': [
    'https://hf-mirror.com/Qwen/Qwen2.5-7B-Instruct-GGUF/resolve/main/qwen2.5-7b-instruct-q4_k_m.gguf'
  ]
}
