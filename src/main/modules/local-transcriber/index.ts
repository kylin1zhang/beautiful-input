import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { EventEmitter } from 'events'
import {
  TranscriptionResult,
  LocalModelType,
  HardwareInfo
} from '@shared/types/index.js'
import { WHISPER_EXECUTABLES } from '@shared/constants/index.js'
import { bufferToWav } from '@shared/utils/index.js'

export class LocalTranscriber extends EventEmitter {
  private whisperProcess: ChildProcess | null = null
  private modelsDir: string

  constructor() {
    super()
    this.modelsDir = join(app.getPath('userData'), 'whisper-models')
  }

  /**
   * 获取 Whisper 可执行文件路径
   */
  private getWhisperExecutable(hw: HardwareInfo): string {
    const platform = hw.platform
    const useGpu = hw.hasNvidia || hw.isAppleSilicon

    let executableName: string

    if (platform === 'win32') {
      executableName = useGpu && hw.hasNvidia
        ? WHISPER_EXECUTABLES.win32.cuda
        : WHISPER_EXECUTABLES.win32.cpu
    } else if (platform === 'darwin') {
      executableName = hw.isAppleSilicon
        ? WHISPER_EXECUTABLES.darwin.metal
        : WHISPER_EXECUTABLES.darwin.cpu
    } else {
      executableName = useGpu && hw.hasNvidia
        ? WHISPER_EXECUTABLES.linux.cuda
        : WHISPER_EXECUTABLES.linux.cpu
    }

    // 开发环境：从 resources 目录读取
    // 生产环境：从 app.asar.unpacked 或 resources 目录读取
    const devPath = join(__dirname, '../../../../resources/whisper', executableName)
    const prodPath = join(process.resourcesPath, 'whisper', executableName)

    if (process.env.NODE_ENV === 'development' && existsSync(devPath)) {
      return devPath
    }

    return prodPath
  }

  /**
   * 获取模型路径
   */
  private getModelPath(modelType: LocalModelType): string {
    return join(this.modelsDir, `ggml-${modelType}.bin`)
  }

  /**
   * 转录音频
   */
  async transcribe(
    audioBuffer: Buffer,
    modelType: LocalModelType,
    hw: HardwareInfo,
    language: string = 'auto',
    threads: number = 4
  ): Promise<TranscriptionResult> {
    // 转换为 WAV 格式
    const wavBuffer = bufferToWav(audioBuffer, 16000, 1)

    // 获取可执行文件路径
    const whisperPath = this.getWhisperExecutable(hw)
    const modelPath = this.getModelPath(modelType)

    // 检查文件是否存在
    if (!existsSync(whisperPath)) {
      return {
        success: false,
        error: 'Whisper 可执行文件不存在，请重新安装应用'
      }
    }

    if (!existsSync(modelPath)) {
      return {
        success: false,
        error: '模型文件不存在，请先下载模型'
      }
    }

    // 构建命令参数
    const args = [
      '-m', modelPath,
      '-f', '-',  // 从 stdin 读取
      '-nt',  // 不打印时间戳
      '--output-txt',  // 输出文本
      '-t', threads.toString()
    ]

    // GPU 加速
    if (hw.hasNvidia) {
      args.push('--gpu')
    } else if (hw.isAppleSilicon) {
      // Apple Silicon 使用 Metal 加速
      // whisper-metal 自动使用 GPU，无需额外参数
    }

    // 语言设置
    if (language && language !== 'auto') {
      args.push('-l', language)
    }

    return new Promise((resolve) => {
      try {
        this.whisperProcess = spawn(whisperPath, args, {
          stdio: ['pipe', 'pipe', 'pipe']
        })

        let stdout = ''
        let stderr = ''

        this.whisperProcess.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString()
        })

        this.whisperProcess.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString()
        })

        this.whisperProcess.on('close', (code) => {
          this.whisperProcess = null

          if (code !== 0) {
            resolve({
              success: false,
              error: `Whisper 进程异常退出 (code ${code}): ${stderr}`
            })
            return
          }

          // 解析输出
          const text = this.parseWhisperOutput(stdout)

          if (!text) {
            resolve({
              success: false,
              error: '无法识别语音内容'
            })
            return
          }

          resolve({
            success: true,
            text,
            confidence: 1.0
          })
        })

        this.whisperProcess.on('error', (error) => {
          this.whisperProcess = null
          resolve({
            success: false,
            error: `Whisper 进程启动失败: ${error.message}`
          })
        })

        // 写入音频数据到 stdin
        this.whisperProcess.stdin?.write(wavBuffer)
        this.whisperProcess.stdin?.end()

      } catch (error) {
        resolve({
          success: false,
          error: `转录失败: ${(error as Error).message}`
        })
      }
    })
  }

  /**
   * 解析 Whisper 输出
   */
  private parseWhisperOutput(output: string): string {
    // Whisper.cpp 输出格式：
    // [00:00:00.000 --> 00:00:05.000]   识别的文本内容
    // 或纯文本输出

    const lines = output.split('\n')
    const textParts: string[] = []

    for (const line of lines) {
      // 跳过空行和元信息
      if (!line.trim()) continue
      if (line.startsWith('whisper') || line.startsWith('system')) continue

      // 提取文本（移除时间戳）
      const match = line.match(/\[[\d:.]+ --> [\d:.]+\]\s*(.+)/)
      if (match) {
        textParts.push(match[1].trim())
      } else if (!line.includes('[') && !line.includes('processing')) {
        // 纯文本行
        textParts.push(line.trim())
      }
    }

    return textParts.join(' ').trim()
  }

  /**
   * 取消转录
   */
  cancel(): void {
    if (this.whisperProcess) {
      this.whisperProcess.kill()
      this.whisperProcess = null
    }
  }

  /**
   * 销毁模块
   */
  destroy(): void {
    this.cancel()
    this.removeAllListeners()
  }
}
