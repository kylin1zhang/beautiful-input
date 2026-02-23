// src/main/modules/ai-processor/providers/local-llm.ts

import axios from 'axios'
import { BaseAIProvider, DEFAULT_SYSTEM_PROMPT } from './base.js'
import { AIProcessRequest, AiProcessingResponse, AIModelConfig } from '@shared/types/index.js'
import { localLLMModule } from '../../local-llm/index.js'
import { LOCAL_LLM_MODELS } from '../../local-llm/model-configs.js'

/**
 * 本地 LLM Provider
 * 通过 llama.cpp 提供 OpenAI 兼容的本地推理服务
 */
export class LocalLLMProvider extends BaseAIProvider {
  readonly protocol = 'local' as const
  readonly id = 'local'
  readonly name = '本地 LLM (离线)'

  async process(request: AIProcessRequest): Promise<AiProcessingResponse> {
    const abortController = this.createAbortController()

    // 调试：打印收到的请求
    console.log('[LocalLLMProvider] 收到处理请求')
    console.log('[LocalLLMProvider] request.model:', request.model)

    // 验证模型 ID 是否有效（属于本地模型列表）
    const validModelIds = LOCAL_LLM_MODELS.map(m => m.id)
    let modelId = request.model

    if (!modelId || !validModelIds.includes(modelId)) {
      // 如果模型 ID 无效，使用推荐的默认模型
      const defaultModel = LOCAL_LLM_MODELS.find(m => m.recommended) || LOCAL_LLM_MODELS[0]
      modelId = defaultModel.id
      console.log(`[LocalLLMProvider] 模型 ID 无效或为空，使用默认模型: ${modelId}`)
      console.log(`[LocalLLMProvider] 可用的本地模型: ${validModelIds.join(', ')}`)
    }

    try {
      // 确保服务已启动
      console.log('[LocalLLMProvider] 尝试启动服务，模型:', modelId)
      const port = await localLLMModule.startServer(modelId)
      console.log('[LocalLLMProvider] 服务已启动，端口:', port)

      // 通过 OpenAI 兼容接口调用
      const response = await axios.post(
        `http://localhost:${port}/v1/chat/completions`,
        {
          model: modelId,
          messages: [
            {
              role: 'system',
              content: request.systemPrompt || DEFAULT_SYSTEM_PROMPT
            },
            {
              role: 'user',
              content: request.prompt
            }
          ],
          max_tokens: request.maxTokens || 4096,
          temperature: request.temperature || 0.3,
          stream: false
        },
        {
          signal: abortController.signal,
          timeout: 120000  // 本地推理可能较慢
        }
      )

      if (response.data?.choices?.[0]?.message?.content) {
        return {
          success: true,
          result: response.data.choices[0].message.content.trim()
        }
      }

      return {
        success: false,
        error: '本地模型返回数据格式错误'
      }
    } catch (error) {
      // 如果是连接错误，可能是 llama.cpp 服务未启动或格式不支持
      if (axios.isAxiosError(error) && error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: '本地 LLM 服务未启动，请检查 llama.cpp 是否正确安装'
        }
      }
      return this.handleError(error)
    } finally {
      this.abortController = null
    }
  }

  getAvailableModels(): AIModelConfig[] {
    return LOCAL_LLM_MODELS.map(model => ({
      id: model.id,
      name: model.name,
      isDefault: model.recommended
    }))
  }

  async validateApiKey(_apiKey: string): Promise<boolean> {
    // 本地模型不需要 API Key
    return true
  }
}
