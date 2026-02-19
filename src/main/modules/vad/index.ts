import { EventEmitter } from 'events'

export interface VADOptions {
  silenceThreshold?: number // 静音阈值（RMS能量值）
  silenceDuration?: number // 静音持续时间（毫秒）
  minRecordingDuration?: number // 最小录音时长（毫秒）
}

export class VADModule extends EventEmitter {
  private silenceStartTime: number | null = null
  private isSilent = false
  private recordingStartTime: number | null = null

  // 能量滑动窗口（用于平滑判断）
  private energyWindow: number[] = []
  private readonly windowSize = 10 // 滑动窗口大小

  private silenceThreshold: number
  private silenceDuration: number
  private minRecordingDuration: number

  constructor(options: VADOptions = {}) {
    super()
    // 提高默认静音阈值到 0.04
    this.silenceThreshold = options.silenceThreshold ?? 0.04
    this.silenceDuration = options.silenceDuration ?? 5000
    this.minRecordingDuration = options.minRecordingDuration ?? 3000
  }

  /**
   * 启动 VAD 监测
   */
  start(): void {
    this.silenceStartTime = null
    this.isSilent = false
    this.recordingStartTime = Date.now()
    this.energyWindow = []
    console.log('[VAD] 开始监测，静音阈值:', this.silenceThreshold, '静音时长:', this.silenceDuration)
  }

  /**
   * 处理音频数据
   * @param chunk 音频数据块（PCM 16-bit signed）
   */
  process(chunk: Buffer): void {
    // 计算当前音频能量（RMS）
    const energy = this.calculateEnergy(chunk)

    // 更新滑动窗口
    this.energyWindow.push(energy)
    if (this.energyWindow.length > this.windowSize) {
      this.energyWindow.shift()
    }

    // 只有当窗口填满后才进行判断
    if (this.energyWindow.length < this.windowSize) {
      return
    }

    // 计算平均能量（滑动窗口平滑）
    const avgEnergy = this.energyWindow.reduce((a, b) => a + b, 0) / this.energyWindow.length
    const isSilent = avgEnergy < this.silenceThreshold

    // 检查是否达到最小录音时长
    const recordingDuration = this.recordingStartTime
      ? Date.now() - this.recordingStartTime
      : 0

    if (recordingDuration < this.minRecordingDuration) {
      // 还没达到最小录音时长，重置静音检测
      this.silenceStartTime = null
      this.isSilent = false
      return
    }

    if (isSilent) {
      if (!this.isSilent) {
        // 从有声转为静音，记录开始时间
        this.silenceStartTime = Date.now()
        this.isSilent = true
        console.log('[VAD] 检测到静音开始，能量:', avgEnergy.toFixed(4))
      } else if (this.silenceStartTime) {
        // 已经静音一段时间了，检查是否超过阈值
        const silenceDuration = Date.now() - this.silenceStartTime
        if (silenceDuration >= this.silenceDuration) {
          console.log('[VAD] 静音时长达到阈值 (', silenceDuration, 'ms)，触发停止')
          this.emit('silence-detected')
          // 重置状态
          this.silenceStartTime = null
          this.isSilent = false
          this.energyWindow = []
        }
      }
    } else {
      // 检测到声音，重置静音状态
      if (this.isSilent) {
        console.log('[VAD] 检测到声音，重置静音计时，能量:', avgEnergy.toFixed(4))
      }
      this.silenceStartTime = null
      this.isSilent = false
    }
  }

  /**
   * 计算音频能量（RMS - 均方根）
   * @param chunk PCM 16-bit signed 音频数据
   * @returns RMS 能量值（归一化到 0-1 范围）
   */
  private calculateEnergy(chunk: Buffer): number {
    let sum = 0
    const samples = chunk.length / 2 // 16-bit = 2 bytes per sample

    for (let i = 0; i < chunk.length; i += 2) {
      // 读取 16-bit signed little-endian 样本
      const sample = chunk.readInt16LE(i)
      // 归一化到 [-1, 1] 范围
      const normalized = sample / 32768
      sum += normalized * normalized
    }

    const rms = Math.sqrt(sum / samples)
    return rms
  }

  /**
   * 停止 VAD 监测
   */
  stop(): void {
    this.silenceStartTime = null
    this.isSilent = false
    this.recordingStartTime = null
    this.energyWindow = []
    console.log('[VAD] 停止监测')
  }

  /**
   * 重置 VAD 状态
   */
  reset(): void {
    this.silenceStartTime = null
    this.isSilent = false
    this.recordingStartTime = null
    this.energyWindow = []
  }

  /**
   * 检查当前是否静音
   */
  getIsSilent(): boolean {
    return this.isSilent
  }

  /**
   * 获取当前静音持续时长（毫秒）
   */
  getSilenceDuration(): number {
    if (!this.silenceStartTime) return 0
    return Date.now() - this.silenceStartTime
  }
}
