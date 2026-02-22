// src/main/modules/local-llm/model-configs.ts

import { LocalLLMModel } from '@shared/types/index.js'

/**
 * 内置本地 LLM 模型配置
 */
export const LOCAL_LLM_MODELS: LocalLLMModel[] = [
  {
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    name: 'Qwen2.5 1.5B (轻量)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: '1.1GB',
    sizeBytes: 1.1 * 1024 * 1024 * 1024,
    ramRequired: '2GB',
    recommended: true
  },
  {
    id: 'phi-3.5-mini-instruct-q4_k_m',
    name: 'Phi-3.5 Mini (平衡)',
    url: 'https://huggingface.co/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf',
    size: '2.2GB',
    sizeBytes: 2.2 * 1024 * 1024 * 1024,
    ramRequired: '4GB',
    recommended: false
  },
  {
    id: 'qwen2.5-3b-instruct-q4_k_m',
    name: 'Qwen2.5 3B (效果优先)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
    size: '2.0GB',
    sizeBytes: 2.0 * 1024 * 1024 * 1024,
    ramRequired: '4GB',
    recommended: false
  }
]

/**
 * 国内镜像地址
 */
export const LOCAL_LLM_MIRROR_URLS: Record<string, string[]> = {
  'qwen2.5-1.5b-instruct-q4_k_m': [
    'https://hf-mirror.com/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
  ],
  'phi-3.5-mini-instruct-q4_k_m': [
    'https://hf-mirror.com/microsoft/Phi-3.5-mini-instruct-gguf/resolve/main/Phi-3.5-mini-instruct-q4_k_m.gguf'
  ],
  'qwen2.5-3b-instruct-q4_k_m': [
    'https://hf-mirror.com/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf'
  ]
}
