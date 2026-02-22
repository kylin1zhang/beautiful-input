// src/main/modules/ai-processor/providers/base.ts

import { AIProcessRequest, AiProcessingResponse, AIModelConfig } from '@shared/types/index.js'

/**
 * AI 服务提供商抽象基类
 * 所有具体的 Provider 实现都需要继承此类
 */
export abstract class BaseAIProvider {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly protocol: 'openai-compatible' | 'claude' | 'gemini' | 'local'

  protected abortController: AbortController | null = null

  /**
   * 执行文本处理
   */
  abstract process(request: AIProcessRequest): Promise<AiProcessingResponse>

  /**
   * 获取可用模型列表
   */
  abstract getAvailableModels(): AIModelConfig[]

  /**
   * 验证 API Key 是否有效
   */
  abstract validateApiKey(apiKey: string, baseUrl?: string): Promise<boolean>

  /**
   * 取消当前请求
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  /**
   * 创建新的 AbortController
   */
  protected createAbortController(): AbortController {
    this.abortController = new AbortController()
    return this.abortController
  }

  /**
   * 处理通用错误
   */
  protected handleError(error: unknown): AiProcessingResponse {
    if (this.isAbortError(error)) {
      return {
        success: false,
        error: '请求已取消'
      }
    }

    const message = error instanceof Error ? error.message : '未知错误'
    console.error(`[${this.name}Provider] 处理失败:`, error)

    return {
      success: false,
      error: message
    }
  }

  /**
   * 检查是否为取消错误
   */
  protected isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError'
  }
}

/**
 * 默认系统提示词
 */
export const DEFAULT_SYSTEM_PROMPT = `你是一个专业的文本处理助手，擅长整理口语化文本、格式化内容、翻译和总结。请直接输出处理后的文本，不要添加任何解释或说明。`
