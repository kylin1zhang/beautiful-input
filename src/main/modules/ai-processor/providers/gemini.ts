// src/main/modules/ai-processor/providers/gemini.ts

import axios, { AxiosError } from 'axios'
import { BaseAIProvider, DEFAULT_SYSTEM_PROMPT } from './base.js'
import { AIProcessRequest, AiProcessingResponse, AIModelConfig } from '@shared/types/index.js'

/**
 * Google Gemini Provider
 */
export class GeminiProvider extends BaseAIProvider {
  readonly protocol = 'gemini' as const
  readonly id = 'gemini'
  readonly name = 'Google Gemini'

  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  private readonly models: AIModelConfig[] = [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (快速)', isDefault: true },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (实验版)' }
  ]

  async process(request: AIProcessRequest): Promise<AiProcessingResponse> {
    const abortController = this.createAbortController()

    try {
      const response = await axios.post(
        `${this.baseUrl}/models/${request.model}:generateContent`,
        {
          contents: [
            {
              parts: [{ text: request.prompt }]
            }
          ],
          systemInstruction: {
            parts: [{ text: request.systemPrompt || DEFAULT_SYSTEM_PROMPT }]
          },
          generationConfig: {
            maxOutputTokens: request.maxTokens || 4096,
            temperature: request.temperature || 0.3
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          params: {
            key: request.apiKey
          },
          signal: abortController.signal,
          timeout: 60000
        }
      )

      // Gemini 返回格式: candidates[0].content.parts[0].text
      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (text) {
        return {
          success: true,
          result: text.trim()
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
      const response = await axios.get(
        `${this.baseUrl}/models`,
        {
          params: { key: apiKey },
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
          case 400:
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
