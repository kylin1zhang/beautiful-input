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

    try {
      // 确保服务已启动
      const port = await localLLMModule.startServer(request.model)

      // 通过 OpenAI 兼容接口调用
      const response = await axios.post(
        `http://localhost:${port}/v1/chat/completions`,
        {
          model: request.model,
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
