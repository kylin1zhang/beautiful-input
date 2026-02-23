import { BaseASRProvider } from './providers/base.js'
import { AliyunASRProvider } from './providers/aliyun.js'
import { ASRProviderConfig, ASRCallbacks } from './types.js'
import { StreamingASRProvider } from '@shared/types'

/**
 * ASR 提供商路由器
 * 根据配置选择合适的提供商
 */
export class ASRRouter {
  private providers: Map<StreamingASRProvider, BaseASRProvider> = new Map()
  private currentProvider: BaseASRProvider | null = null

  /**
   * 注册提供商
   */
  registerProvider(provider: BaseASRProvider): void {
    this.providers.set(provider.getProviderName(), provider)
  }

  /**
   * 获取提供商
   */
  getProvider(name: StreamingASRProvider): BaseASRProvider | undefined {
    return this.providers.get(name)
  }

  /**
   * 设置当前提供商
   */
  async setCurrentProvider(name: StreamingASRProvider): Promise<boolean> {
    const provider = this.providers.get(name)
    if (!provider) {
      console.error(`[ASRRouter] 提供商 ${name} 未注册`)
      return false
    }

    // 检查是否可用
    const available = await provider.isAvailable()
    if (!available) {
      console.error(`[ASRRouter] 提供商 ${name} 不可用`)
      return false
    }

    this.currentProvider = provider
    return true
  }

  /**
   * 获取当前提供商
   */
  getCurrentProvider(): BaseASRProvider | null {
    return this.currentProvider
  }

  /**
   * 获取可用的提供商列表
   */
  async getAvailableProviders(): Promise<StreamingASRProvider[]> {
    const available: StreamingASRProvider[] = []
    for (const [name, provider] of this.providers) {
      if (await provider.isAvailable()) {
        available.push(name)
      }
    }
    return available
  }

  /**
   * 销毁所有提供商
   */
  destroyAll(): void {
    for (const provider of this.providers.values()) {
      provider.destroy()
    }
    this.providers.clear()
    this.currentProvider = null
  }
}

/**
 * 创建提供商实例
 */
export function createProvider(
  name: StreamingASRProvider,
  config: ASRProviderConfig,
  callbacks: ASRCallbacks
): BaseASRProvider {
  switch (name) {
    case 'aliyun':
      return new AliyunASRProvider(config, callbacks)
    // 其他提供商在后续任务中添加
    default:
      throw new Error(`不支持的提供商: ${name}`)
  }
}
