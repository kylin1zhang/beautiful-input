import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import { platform } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { VADModule } from '../vad/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export interface RecordingOptions {
  sampleRate?: number
  channels?: number
  bitDepth?: number
}

export class RecordingModule extends EventEmitter {
  private recordingProcess: ChildProcess | null = null
  private audioChunks: Buffer[] = []
  private isRecording = false
  private options: Required<RecordingOptions>
  private vadModule: VADModule | null = null

  constructor(options: RecordingOptions = {}) {
    super()
    this.options = {
      sampleRate: options.sampleRate ?? 16000,
      channels: options.channels ?? 1,
      bitDepth: options.bitDepth ?? 16
    }
  }

  /**
   * 检查麦克风权限
   */
  async checkPermission(): Promise<boolean> {
    const os = platform()

    try {
      if (os === 'darwin') {
        // macOS: 尝试录制一小段音频来检查权限
        return await this.checkMacOSPermission()
      } else if (os === 'win32') {
        // Windows: 检查录音设备
        return await this.checkWindowsPermission()
      } else if (os === 'linux') {
        // Linux: 检查录音设备
        return await this.checkLinuxPermission()
      }
      return false
    } catch (error) {
      console.error('[Recording] 检查权限失败:', error)
      return false
    }
  }

  /**
   * 检查 macOS 权限
   */
  private async checkMacOSPermission(): Promise<boolean> {
    return new Promise((resolve) => {
      // 使用 sox 或 rec 命令测试录音
      const testProcess = spawn('rec', ['-n', 'null', 'trim', '0', '0.1'], {
        stdio: 'ignore'
      })

      testProcess.on('error', () => {
        // 尝试使用 arecord
        const arecordProcess = spawn('arecord', ['-d', '0.1', '-f', 'S16_LE', '/dev/null'], {
          stdio: 'ignore'
        })

        arecordProcess.on('error', () => resolve(false))
        arecordProcess.on('close', (code) => resolve(code === 0))
      })

      testProcess.on('close', (code) => resolve(code === 0))
    })
  }

  /**
   * 检查 Windows 权限
   */
  private async checkWindowsPermission(): Promise<boolean> {
    // 使用与录音相同的方法检测设备
    const deviceName = await this.getWindowsMicDevice()
    return deviceName !== null
  }

  /**
   * 检查 Linux 权限
   */
  private async checkLinuxPermission(): Promise<boolean> {
    return new Promise((resolve) => {
      // 使用 arecord 检查录音设备
      const arecord = spawn('arecord', ['-l'], { stdio: 'pipe' })

      let output = ''
      arecord.stdout?.on('data', (data) => {
        output += data.toString()
      })

      arecord.on('close', () => {
        resolve(output.includes('card'))
      })

      arecord.on('error', () => resolve(false))
    })
  }

  /**
   * 开始录音
   */
  async startRecording(autoStopOptions?: {
    enableVAD: boolean
    vadSilenceDuration: number
  }): Promise<void> {
    if (this.isRecording) {
      throw new Error('正在录音中')
    }

    const os = platform()
    this.audioChunks = []
    this.isRecording = true

    // 初始化 VAD 模块
    if (autoStopOptions?.enableVAD) {
      this.vadModule = new VADModule({
        silenceThreshold: 0.04,
        silenceDuration: autoStopOptions.vadSilenceDuration,
        minRecordingDuration: 3000
      })
      this.vadModule.on('silence-detected', () => {
        console.log('[Recording] VAD 检测到静音，触发自动停止')
        this.emit('auto-stop', { reason: 'vad' })
      })
      this.vadModule.start()
    }

    try {
      if (os === 'darwin') {
        await this.startMacOSRecording()
      } else if (os === 'win32') {
        await this.startWindowsRecording()
      } else if (os === 'linux') {
        await this.startLinuxRecording()
      } else {
        throw new Error('不支持的操作系统')
      }

      this.emit('started')
    } catch (error) {
      this.isRecording = false
      throw error
    }
  }

  /**
   * 开始 macOS 录音
   */
  private async startMacOSRecording(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 尝试使用 sox/rec
      this.recordingProcess = spawn('rec', [
        '-q', // 安静模式
        '-r', this.options.sampleRate.toString(),
        '-c', this.options.channels.toString(),
        '-b', this.options.bitDepth.toString(),
        '-e', 'signed-integer',
        '-t', 'raw',
        '-' // 输出到 stdout
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      this.setupRecordingProcess(resolve, reject)
    })
  }

  /**
   * 开始 Windows 录音
   */
  private async startWindowsRecording(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 先获取麦克风设备名称
      this.getWindowsMicDevice().then((deviceName) => {
        if (!deviceName) {
          reject(new Error('找不到麦克风设备'))
          return
        }

        console.log('[Recording] 使用设备:', deviceName)

        // 使用 ffmpeg 录音
        this.recordingProcess = spawn('ffmpeg', [
          '-f', 'dshow',
          '-i', `audio=${deviceName}`,
          '-ar', this.options.sampleRate.toString(),
          '-ac', this.options.channels.toString(),
          '-sample_fmt', 's16',
          '-f', 's16le',
          '-'
        ], {
          stdio: ['ignore', 'pipe', 'pipe']
        })

        this.setupRecordingProcess(resolve, reject)
      }).catch((error) => {
        reject(error)
      })
    })
  }

  /**
   * 获取 Windows 麦克风设备名称
   */
  private async getWindowsMicDevice(): Promise<string | null> {
    return new Promise((resolve) => {
      const ffmpeg = spawn('ffmpeg', ['-f', 'dshow', '-list_devices', 'true', '-i', 'dummy'], {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let output = ''
      // ffmpeg 输出设备列表到 stderr
      ffmpeg.stderr?.on('data', (data) => {
        output += data.toString()
      })

      ffmpeg.on('close', () => {
        // 查找音频设备 - 格式: [dshow @ ...] "设备名称" (audio)
        const lines = output.split('\n')
        for (const line of lines) {
          // 匹配 "设备名称" (audio) 格式
          const match = line.match(/"([^"]+)"\s*\(\s*audio\s*\)/)
          if (match) {
            const deviceName = match[1].trim()
            console.log('[Recording] 找到音频设备:', deviceName)
            resolve(deviceName)
            return
          }
        }
        console.log('[Recording] 未找到音频设备，完整输出:')
        console.log(output)
        resolve(null)
      })

      ffmpeg.on('error', (error) => {
        console.error('[Recording] ffmpeg 启动失败:', error)
        resolve(null)
      })

      setTimeout(() => {
        ffmpeg.kill()
        resolve(null)
      }, 10000)
    })
  }

  /**
   * 开始 Linux 录音
   */
  private async startLinuxRecording(): Promise<void> {
    return new Promise((resolve, reject) => {
      // 使用 arecord
      this.recordingProcess = spawn('arecord', [
        '-q', // 安静模式
        '-r', this.options.sampleRate.toString(),
        '-c', this.options.channels.toString(),
        '-f', 'S16_LE',
        '-t', 'raw',
        '-'
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      this.setupRecordingProcess(resolve, reject)
    })
  }

  /**
   * 设置录音进程
   */
  private setupRecordingProcess(resolve: () => void, reject: (error: Error) => void): void {
    if (!this.recordingProcess) {
      reject(new Error('录音进程创建失败'))
      return
    }

    this.recordingProcess.stdout?.on('data', (chunk: Buffer) => {
      this.audioChunks.push(chunk)
      this.emit('data', chunk)

      // 如果启用了 VAD，持续处理音频数据
      if (this.vadModule) {
        this.vadModule.process(chunk)
      }
    })

    this.recordingProcess.stderr?.on('data', (data: Buffer) => {
      const message = data.toString()
      // 过滤掉正常的日志信息
      if (!message.includes('Input') && !message.includes('Output') && !message.includes('size')) {
        console.error('[Recording]', message)
      }
    })

    this.recordingProcess.on('error', (error) => {
      console.error('[Recording] 进程错误:', error)
      this.isRecording = false
      reject(error)
    })

    this.recordingProcess.on('exit', (code) => {
      if (code !== 0 && code !== null && this.isRecording) {
        console.error(`[Recording] 进程异常退出，代码: ${code}`)
      }
      this.isRecording = false
      this.emit('stopped')
    })

    // 等待进程启动
    setTimeout(() => {
      if (this.recordingProcess && !this.recordingProcess.killed) {
        resolve()
      } else {
        reject(new Error('录音进程启动失败'))
      }
    }, 500)
  }

  /**
   * 停止录音
   */
  async stopRecording(): Promise<Buffer> {
    if (!this.isRecording || !this.recordingProcess) {
      throw new Error('没有正在进行的录音')
    }

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        reject(new Error('停止录音超时'))
      }, 5000)

      this.once('stopped', () => {
        clearTimeout(timeout)
        const audioBuffer = Buffer.concat(this.audioChunks)
        resolve(audioBuffer)
      })

      // 终止录音进程
      if (this.recordingProcess) {
        if (platform() === 'win32') {
          // Windows 上使用 taskkill
          spawn('taskkill', ['/pid', this.recordingProcess.pid!.toString(), '/f'])
        } else {
          this.recordingProcess.kill('SIGTERM')
          // 如果 2 秒后还没退出，强制终止
          setTimeout(() => {
            if (this.recordingProcess && !this.recordingProcess.killed) {
              this.recordingProcess.kill('SIGKILL')
            }
          }, 2000)
        }
      }
    })
  }

  /**
   * 获取录音状态
   */
  getIsRecording(): boolean {
    return this.isRecording
  }

  /**
   * 获取已录音时长（秒）
   */
  getRecordedDuration(): number {
    if (!this.isRecording || this.audioChunks.length === 0) {
      return 0
    }

    const totalBytes = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const bytesPerSecond = (this.options.sampleRate * this.options.channels * this.options.bitDepth) / 8
    return Math.floor(totalBytes / bytesPerSecond)
  }

  /**
   * 销毁模块
   */
  destroy(): void {
    if (this.recordingProcess && !this.recordingProcess.killed) {
      this.recordingProcess.kill('SIGKILL')
    }
    if (this.vadModule) {
      this.vadModule.removeAllListeners()
      this.vadModule = null
    }
    this.removeAllListeners()
  }
}
