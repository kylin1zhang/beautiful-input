import { exec } from 'child_process'
import { promisify } from 'util'
import { platform, totalmem } from 'os'
import { HardwareInfo, LocalModelType } from '@shared/types/index.js'

const execAsync = promisify(exec)

export class HardwareDetector {
  /**
   * 检测硬件信息
   */
  async detect(): Promise<HardwareInfo> {
    const currentPlatform = platform() as 'win32' | 'darwin' | 'linux'

    const result: HardwareInfo = {
      platform: currentPlatform,
      hasNvidia: false,
      isAppleSilicon: false,
      totalMemory: Math.round(totalmem() / (1024 * 1024 * 1024)),
      recommendedModel: 'base',
      recommendedReason: ''
    }

    // 检测 NVIDIA GPU
    if (currentPlatform === 'win32' || currentPlatform === 'linux') {
      const nvidiaInfo = await this.detectNvidia()
      result.hasNvidia = nvidiaInfo.hasNvidia
      result.nvidiaGpuName = nvidiaInfo.name
      result.vram = nvidiaInfo.vram
    }

    // 检测 Apple Silicon
    if (currentPlatform === 'darwin') {
      result.isAppleSilicon = await this.detectAppleSilicon()
    }

    // 推荐模型
    const recommendation = this.recommendModel(result)
    result.recommendedModel = recommendation.model
    result.recommendedReason = recommendation.reason

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
      // Windows 使用 nvidia-smi
      if (platform() === 'win32') {
        const { stdout } = await execAsync(
          'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits',
          { timeout: 5000 }
        )
        const lines = stdout.trim().split('\n')
        if (lines.length > 0) {
          const [name, vram] = lines[0].split(',').map(s => s.trim())
          return {
            hasNvidia: true,
            name,
            vram: parseInt(vram, 10)
          }
        }
      }

      // Linux 使用 nvidia-smi
      if (platform() === 'linux') {
        const { stdout } = await execAsync(
          'nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null',
          { timeout: 5000 }
        )
        if (stdout.trim()) {
          const [name, vram] = stdout.trim().split(',').map(s => s.trim())
          return {
            hasNvidia: true,
            name,
            vram: parseInt(vram, 10)
          }
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
      return stdout.includes('Apple') || stdout.includes('M1') || stdout.includes('M2') || stdout.includes('M3')
    } catch {
      // 无法检测，假设不是 Apple Silicon
      return false
    }
  }

  /**
   * 根据硬件推荐模型
   */
  private recommendModel(hw: HardwareInfo): {
    model: LocalModelType
    reason: string
  } {
    // NVIDIA GPU 8GB+ 显存 -> large-v3
    if (hw.hasNvidia && hw.vram && hw.vram >= 8000) {
      return {
        model: 'large-v3',
        reason: '检测到高性能 NVIDIA GPU，推荐使用最高精度模型'
      }
    }

    // NVIDIA GPU 4-8GB 显存 -> medium
    if (hw.hasNvidia && hw.vram && hw.vram >= 4000) {
      return {
        model: 'medium',
        reason: '检测到 NVIDIA GPU，推荐使用中等模型'
      }
    }

    // Apple Silicon -> medium
    if (hw.isAppleSilicon) {
      return {
        model: 'medium',
        reason: '检测到 Apple Silicon 芯片，推荐使用中等模型'
      }
    }

    // CPU + 16GB+ 内存 -> small
    if (hw.totalMemory >= 16) {
      return {
        model: 'small',
        reason: '内存充足，推荐使用 small 模型'
      }
    }

    // CPU + 8-16GB 内存 -> base
    return {
      model: 'base',
      reason: '推荐使用 base 模型，速度和准确率兼顾'
    }
  }
}
