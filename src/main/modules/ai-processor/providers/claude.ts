// src/main/modules/ai-processor/providers/claude.ts

import axios, { AxiosError } from 'axios'
import { BaseAIProvider, DEFAULT_SYSTEM_PROMPT } from './base.js'
import { AIProcessRequest, AiProcessingResponse, AIModelConfig } from '@shared/types/index.js'

/**
 * Anthropic Claude Provider
 */
export class ClaudeProvider extends BaseAIProvider {
  readonly protocol = 'claude' as const
  readonly id = 'claude'
  readonly name = 'Claude (Anthropic)'

  private readonly baseUrl = 'https://api.anthropic.com/v1'

  private readonly models: AIModelConfig[] = [
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (快速)', isDefault: true },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' }
  ]

  async process(request: AIProcessRequest): Promise<AiProcessingResponse> {
    const abortController = this.createAbortController()

    try {
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          model: request.model,
          max_tokens: request.maxTokens || 4096,
          system: request.systemPrompt || DEFAULT_SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: request.prompt }
          ]
        },
        {
          headers: {
            'x-api-key': request.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          signal: abortController.signal,
          timeout: 60000
        }
      )

      // Claude API 返回格式: content[0].text
      if (response.data?.content?.[0]?.text) {
        return {
          success: true,
          result: response.data.content[0].text.trim()
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

  async validateApiKey(apiKey: string): Promise<boolean> {
    try {
      // Claude 没有单独的 models 端点，发送一个最小请求验证
      const response = await axios.post(
        `${this.baseUrl}/messages`,
        {
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      )
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
            return { success: false, error: 'API Key 无效' }
          case 429:
            return { success: false, error: '请求过于频繁，请稍后重试' }
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
