// src/main/modules/ai-processor/providers/openai-compatible.ts

import axios, { AxiosError } from 'axios'
import { BaseAIProvider, DEFAULT_SYSTEM_PROMPT } from './base.js'
import { AIProcessRequest, AiProcessingResponse, AIModelConfig } from '@shared/types/index.js'

/**
 * OpenAI 兼容格式 Provider
 * 适用于：OpenAI、DeepSeek、Qwen、GLM、Groq 以及用户自定义的 OpenAI 兼容服务
 */
export class OpenAICompatibleProvider extends BaseAIProvider {
  readonly protocol = 'openai-compatible' as const

  constructor(
    public readonly id: string,
    public readonly name: string,
    private readonly defaultBaseUrl: string,
    private readonly models: AIModelConfig[],
    private readonly defaultTemperature: number = 0.3,
    private readonly defaultMaxTokens: number = 4096
  ) {
    super()
  }

  async process(request: AIProcessRequest): Promise<AiProcessingResponse> {
    const abortController = this.createAbortController()
    const baseUrl = request.baseUrl || this.defaultBaseUrl

    try {
      const response = await axios.post(
        `${baseUrl}/chat/completions`,
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
          max_tokens: request.maxTokens || this.defaultMaxTokens,
          temperature: request.temperature || this.defaultTemperature,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${request.apiKey}`,
            'Content-Type': 'application/json'
          },
          signal: abortController.signal,
          timeout: 60000
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
        error: 'API 返回数据格式错误'
      }
    } catch (error) {
      return this.handleApiError(error)
    } finally {
      this.abortController = null
    }
  }

  getAvailableModels(): AIModelConfig[] {
    return this.models
  }

  async validateApiKey(apiKey: string, baseUrl?: string): Promise<boolean> {
    try {
      const url = baseUrl || this.defaultBaseUrl
      const response = await axios.get(`${url}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 10000
      })
      return response.status === 200
    } catch {
      return false
    }
  }

  private handleApiError(error: unknown): AiProcessingResponse {
    if (this.isAbortError(error)) {
      return { success: false, error: '请求已取消' }
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: { message?: string } }>

      if (axiosError.response) {
        const status = axiosError.response.status
        const message = axiosError.response.data?.error?.message

        switch (status) {
          case 401:
            return { success: false, error: 'API Key 无效，请检查设置' }
          case 429:
            return { success: false, error: '请求过于频繁，请稍后重试' }
          case 402:
            return { success: false, error: '账户余额不足，请充值' }
          default:
            return { success: false, error: `API 错误: ${message || axiosError.message}` }
        }
      }

      if (axiosError.request) {
        return { success: false, error: '网络错误，请检查网络连接' }
      }
    }

    return this.handleError(error)
  }
}
