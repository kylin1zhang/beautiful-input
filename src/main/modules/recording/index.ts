import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import { platform } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { existsSync } from 'fs'
import { app } from 'electron'
import { VADModule } from '../vad/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 获取 ffmpeg 可执行文件路径
 */
function getFfmpegPath(): string {
  const os = platform()

  // 开发环境：使用 node_modules 中的 ffmpeg
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    // 动态导入 ffmpeg-installer
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
    console.log('[Recording] 开发环境 ffmpeg 路径:', ffmpegPath)
    return ffmpegPath
  }

  // 生产环境：使用打包的 ffmpeg
  if (os === 'win32') {
    const packedPath = join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
    console.log('[Recording] 生产环境 ffmpeg 路径:', packedPath)
    return packedPath
  } else if (os === 'darwin') {
    return join(process.resourcesPath, 'ffmpeg', 'ffmpeg')
  } else {
    return join(process.resourcesPath, 'ffmpeg', 'ffmpeg')
  }
}

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
   * 验证 ffmpeg 是否存在且可执行
   * @returns { valid: boolean, path: string, error?: string }
   */
  verifyFfmpeg(): { valid: boolean; path: string; error?: string } {
    const ffmpegPath = getFfmpegPath()

    if (!existsSync(ffmpegPath)) {
      const error = `ffmpeg 不存在于路径: ${ffmpegPath}`
      console.error('[Recording]', error)
      return { valid: false, path: ffmpegPath, error }
    }

    console.log('[Recording] ffmpeg 验证通过:', ffmpegPath)
    return { valid: true, path: ffmpegPath }
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
   * 通过尝试录制一小段音频来检测权限
   */
  private async checkWindowsPermission(): Promise<boolean> {
    return new Promise((resolve) => {
      const deviceName = this.getWindowsMicDevice()

      deviceName.then((name) => {
        if (!name) {
          console.log('[Recording] 未找到麦克风设备')
          resolve(false)
          return
        }

        // 尝试实际录制一小段音频来检测权限
        const ffmpegPath = getFfmpegPath()
        const testProcess = spawn(ffmpegPath, [
          '-f', 'dshow',
          '-i', `audio=${name}`,
          '-t', '0.5',  // 只录制 0.5 秒
          '-f', 'null',
          '-'  // 输出到 null
        ], {
          stdio: ['ignore', 'ignore', 'pipe']
        })

        let stderr = ''
        testProcess.stderr?.on('data', (data) => {
          stderr += data.toString()
        })

        const timeout = setTimeout(() => {
          testProcess.kill()
          resolve(false)
        }, 5000)  // 5 秒超时

        testProcess.on('close', (code) => {
          clearTimeout(timeout)
          // 如果成功录制（code=0）或者有音频数据输出，说明权限正常
          if (code === 0) {
            console.log('[Recording] 麦克风权限检测通过')
            resolve(true)
          } else if (stderr.includes('Could not open audio device') || stderr.includes('Permission denied')) {
            console.log('[Recording] 麦克风权限被拒绝')
            resolve(false)
          } else if (stderr.includes('size=') || stderr.includes('time=')) {
            // 有输出，说明权限正常
            console.log('[Recording] 检测到音频输出，权限正常')
            resolve(true)
          } else {
            // 其他情况也认为权限正常（可能是设备问题而非权限问题）
            console.log('[Recording] 录制退出，code:', code, 'stderr:', stderr.substring(0, 200))
            resolve(true)
          }
        })

        testProcess.on('error', (err) => {
          clearTimeout(timeout)
          console.error('[Recording] 测试进程错误:', err)
          resolve(false)
        })
      }).catch((err) => {
        console.error('[Recording] 获取设备失败:', err)
        resolve(false)
      })
    })
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
    vadSilenceThreshold?: number
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
        silenceThreshold: autoStopOptions.vadSilenceThreshold ?? 0.008,
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
      // 先验证 ffmpeg 是否存在
      const ffmpegCheck = this.verifyFfmpeg()
      if (!ffmpegCheck.valid) {
        reject(new Error(`ffmpeg 启动失败: ${ffmpegCheck.error}`))
        return
      }

      // 获取麦克风设备名称
      this.getWindowsMicDevice().then((deviceName) => {
        if (!deviceName) {
          reject(new Error('找不到麦克风设备'))
          return
        }

        console.log('[Recording] 使用设备:', deviceName)

        // 使用 ffmpeg 录音
        const ffmpegPath = getFfmpegPath()
        this.recordingProcess = spawn(ffmpegPath, [
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
      const ffmpegPath = getFfmpegPath()

      // 先验证 ffmpeg 是否存在
      if (!existsSync(ffmpegPath)) {
        console.error('[Recording] ffmpeg 不存在:', ffmpegPath)
        resolve(null)
        return
      }

      const ffmpeg = spawn(ffmpegPath, ['-f', 'dshow', '-list_devices', 'true', '-i', 'dummy'], {
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let output = ''
      // ffmpeg 输出设备列表到 stderr，但也收集 stdout 以防万一
      ffmpeg.stdout?.on('data', (data) => {
        output += data.toString()
      })
      ffmpeg.stderr?.on('data', (data) => {
        output += data.toString()
      })

      const timeout = setTimeout(() => {
        console.log('[Recording] 获取设备列表超时')
        ffmpeg.kill()
        resolve(null)
      }, 10000)

      ffmpeg.on('close', (code) => {
        clearTimeout(timeout)
        console.log('[Recording] ffmpeg 列出设备完成，退出码:', code)
        console.log('[Recording] 设备列表输出:\n', output)

        // 尝试多种匹配模式
        const lines = output.split('\n')
        for (const line of lines) {
          // 模式1: "设备名称" (audio)
          let match = line.match(/"([^"]+)"\s*\(\s*audio\s*\)/i)
          if (match) {
            const deviceName = match[1].trim()
            console.log('[Recording] 找到音频设备 (模式1):', deviceName)
            resolve(deviceName)
            return
          }

          // 模式2: DirectShow audio devices (某些 ffmpeg 版本)
          // [dshow @ ...]  "设备名称"
          if (line.includes('DirectShow audio devices') || line.includes('音频设备')) {
            // 继续找下一行的设备名称
            const idx = lines.indexOf(line)
            if (idx >= 0 && idx + 1 < lines.length) {
              const nextLine = lines[idx + 1]
              match = nextLine.match(/"([^"]+)"/)
              if (match && !match[1].includes('DirectShow')) {
                const deviceName = match[1].trim()
                console.log('[Recording] 找到音频设备 (模式2):', deviceName)
                resolve(deviceName)
                return
              }
            }
          }

          // 模式3: 更宽松的匹配 - 任何带 audio 的引号内容
          if (line.toLowerCase().includes('audio') && line.includes('"')) {
            match = line.match(/"([^"]+)"/)
            if (match) {
              const deviceName = match[1].trim()
              // 排除已知的非设备名称
              if (!deviceName.includes('DirectShow') &&
                  !deviceName.includes('@') &&
                  deviceName.length > 0 &&
                  deviceName.length < 100) {
                console.log('[Recording] 找到音频设备 (模式3):', deviceName)
                resolve(deviceName)
                return
              }
            }
          }
        }

        console.log('[Recording] 未找到音频设备')
        resolve(null)
      })

      ffmpeg.on('error', (error) => {
        clearTimeout(timeout)
        console.error('[Recording] ffmpeg 启动失败:', error)
        resolve(null)
      })
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
