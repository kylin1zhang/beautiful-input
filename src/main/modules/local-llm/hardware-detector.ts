// src/main/modules/local-llm/hardware-detector.ts

import { exec } from 'child_process'
import { promisify } from 'util'
import { platform, totalmem } from 'os'
import { LLMHardwareInfo } from '@shared/types/index.js'
import { LOCAL_LLM_MODELS } from './model-configs.js'

const execAsync = promisify(exec)

export class LLMHardwareDetector {
  /**
   * 检测硬件信息并推荐配置
   */
  async detect(): Promise<LLMHardwareInfo> {
    const currentPlatform = platform() as 'win32' | 'darwin' | 'linux'

    const result: LLMHardwareInfo = {
      platform: currentPlatform,
      hasNvidia: false,
      isAppleSilicon: false,
      totalMemory: Math.round(totalmem() / (1024 * 1024 * 1024)),
      recommendedBackend: 'cpu',
      recommendedModel: LOCAL_LLM_MODELS[0].id
    }

    // 检测 NVIDIA GPU
    if (currentPlatform === 'win32' || currentPlatform === 'linux') {
      const nvidiaInfo = await this.detectNvidia()
      result.hasNvidia = nvidiaInfo.hasNvidia
      result.nvidiaGpuName = nvidiaInfo.name
      result.vram = nvidiaInfo.vram
      if (nvidiaInfo.hasNvidia) {
        result.recommendedBackend = 'cuda'
      }
    }

    // 检测 Apple Silicon
    if (currentPlatform === 'darwin') {
      result.isAppleSilicon = await this.detectAppleSilicon()
      if (result.isAppleSilicon) {
        result.recommendedBackend = 'metal'
      }
    }

    // 推荐模型
    result.recommendedModel = this.recommendModel(result)

    return result
  }

  /**
   * 检测 NVIDIA GPU
   */
  private async detectNvidia(): Promise<{
    hasNvidia: boolean
    name?: string
    vram?: number
  }> {
    try {
      const cmd = platform() === 'win32'
        ? 'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits'
        : 'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null'

      const { stdout } = await execAsync(cmd, { timeout: 5000 })
      const lines = stdout.trim().split('\n')

      if (lines.length > 0 && lines[0].trim()) {
        const [name, vram] = lines[0].split(',').map(s => s.trim())
        return {
          hasNvidia: true,
          name,
          vram: parseInt(vram, 10)
        }
      }
    } catch {
      // nvidia-smi 不可用
    }

    return { hasNvidia: false }
  }

  /**
   * 检测 Apple Silicon
   */
  private async detectAppleSilicon(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('sysctl -n machdep.cpu.brand_string', {
        timeout: 3000
      })
      return stdout.includes('Apple') || stdout.includes('M1') || stdout.includes('M2') || stdout.includes('M3') || stdout.includes('M4')
    } catch {
      return false
    }
  }

  /**
   * 根据硬件推荐模型
   */
  private recommendModel(hw: LLMHardwareInfo): string {
    // GPU 用户或大内存 -> 推荐更大的模型
    if (hw.recommendedBackend !== 'cpu' || hw.totalMemory >= 16) {
      const model = LOCAL_LLM_MODELS.find(m => m.id === 'qwen2.5-3b-instruct-q4_k_m')
      if (model) return model.id
    }

    // 8-16GB 内存 -> 中等模型
    if (hw.totalMemory >= 8) {
      const model = LOCAL_LLM_MODELS.find(m => m.id === 'qwen2.5-1.5b-instruct-q4_k_m')
      if (model) return model.id
    }

    // 低配设备 -> 最小模型
    return LOCAL_LLM_MODELS[0].id
  }
}

// 单例
export const llmHardwareDetector = new LLMHardwareDetector()
