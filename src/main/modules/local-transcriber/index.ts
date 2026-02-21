import { spawn, ChildProcess } from 'child_process'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, unlinkSync, mkdtempSync, rmdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { EventEmitter } from 'events'
import {
  TranscriptionResult,
  LocalModelType,
  HardwareInfo
} from '@shared/types/index.js'
import { WHISPER_EXECUTABLES } from '@shared/constants/index.js'
import { bufferToWav } from '@shared/utils/index.js'

// 动态导入 opencc-js
let toSimplifiedChinese: ((text: string) => string) | null = null

// 初始化繁简转换器
async function initConverter() {
  try {
    const OpenCC = await import('opencc-js')
    const converter = OpenCC.Converter({ from: 'tw', to: 'cn' })
    toSimplifiedChinese = converter
    console.log('[LocalTranscriber] 繁简转换器初始化成功')
  } catch (error) {
    console.warn('[LocalTranscriber] 繁简转换器初始化失败:', error)
  }
}

// 立即初始化
initConverter()

export class LocalTranscriber extends EventEmitter {
  private whisperProcess: ChildProcess | null = null
  private modelsDir: string
  private whisperBinDir: string

  constructor() {
    super()
    this.modelsDir = join(app.getPath('userData'), 'whisper-models')
    this.whisperBinDir = join(app.getPath('userData'), 'whisper-bin')
  }

  /**
   * 获取 Whisper 可执行文件路径
   */
  private getWhisperExecutable(hw: HardwareInfo): string {
    const platform = hw.platform

    // Windows 优先使用 whisper-cli.exe，其次是 main.exe
    // Linux/macOS 使用 main
    const executableNames = platform === 'win32'
      ? ['whisper-cli.exe', 'main.exe']
      : ['whisper-cli', 'main']

    // zip 解压后可能在根目录或 Release 子目录
    for (const exeName of executableNames) {
      const possiblePaths = [
        join(this.whisperBinDir, exeName),
        join(this.whisperBinDir, 'Release', exeName)
      ]

      for (const path of possiblePaths) {
        if (existsSync(path)) {
          console.log('[LocalTranscriber] 找到可执行文件:', path)
          return path
        }
      }
    }

    // 默认返回根目录路径（用于错误提示）
    return join(this.whisperBinDir, 'main.exe')
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
    threads: number = 4,
    personalDictionary: string[] = []
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

    // 创建临时目录和文件
    let tempDir: string | null = null
    let audioFilePath: string | null = null

    try {
      tempDir = mkdtempSync(join(tmpdir(), 'whisper-'))
      audioFilePath = join(tempDir, 'audio.wav')
      await writeFile(audioFilePath, wavBuffer)
      console.log('[LocalTranscriber] 音频文件已写入:', audioFilePath)
    } catch (error) {
      console.error('[LocalTranscriber] 创建临时文件失败:', error)
      return {
        success: false,
        error: `创建临时文件失败: ${(error as Error).message}`
      }
    }

    // 构建命令参数
    const args = [
      '-m', modelPath,
      '-f', audioFilePath,
      '-t', threads.toString()
    ]

    // 语言设置 - whisper-cli 需要 -l 参数指定语言
    // 如果是 'auto' 或未指定，使用自动检测
    if (language && language !== 'auto') {
      args.push('-l', language)
    } else {
      // 自动检测语言
      args.push('-l', 'auto')
    }

    // 个性化字典 - 通过 prompt 参数传递自定义词汇
    // Whisper 最多使用前 244 tokens 的 prompt
    if (personalDictionary && personalDictionary.length > 0) {
      const promptText = personalDictionary.join(', ')
      console.log('[LocalTranscriber] 使用个性化字典:', promptText.substring(0, 100) + (promptText.length > 100 ? '...' : ''))
      args.push('--prompt', promptText)
    }

    // 注意：暂时禁用 GPU 加速，先确保基本功能工作
    // GPU 加速需要特定的 CUDA/ROCm/Metal 配置
    // if (hw.hasNvidia) {
    //   args.push('--gpu')
    // }

    return new Promise((resolve) => {
      try {
        console.log('[LocalTranscriber] 启动 Whisper:', whisperPath, args.join(' '))
        this.whisperProcess = spawn(whisperPath, args, {
          cwd: tempDir!
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

          // 调试输出
          console.log('[LocalTranscriber] Whisper 进程退出，代码:', code)
          console.log('[LocalTranscriber] stdout 长度:', stdout.length)
          console.log('[LocalTranscriber] stderr 长度:', stderr.length)
          if (stdout) {
            console.log('[LocalTranscriber] stdout 前500字符:', stdout.substring(0, 500))
          }
          if (stderr) {
            console.log('[LocalTranscriber] stderr 前500字符:', stderr.substring(0, 500))
          }

          // 清理临时文件
          if (tempDir) {
            try {
              if (audioFilePath && existsSync(audioFilePath)) {
                unlinkSync(audioFilePath)
              }
              // 清理 whisper 生成的输出文件
              const txtFile = join(tempDir, 'audio.wav.txt')
              if (existsSync(txtFile)) {
                // 读取输出文件内容
                const { readFileSync } = require('fs')
                const txtContent = readFileSync(txtFile, 'utf-8')
                console.log('[LocalTranscriber] 输出文件内容:', txtContent)
                unlinkSync(txtFile)
              }
              rmdirSync(tempDir)
            } catch (e) {
              console.warn('[LocalTranscriber] 清理临时文件失败:', e)
            }
          }

          if (code !== 0) {
            console.error('[LocalTranscriber] Whisper 进程退出，代码:', code, 'stderr:', stderr)
            resolve({
              success: false,
              error: `Whisper 进程异常退出 (code ${code}): ${stderr || '未知错误'}`
            })
            return
          }

          // 解析输出
          const text = this.parseWhisperOutput(stdout + '\n' + stderr)
          console.log('[LocalTranscriber] 解析输出:', text ? `"${text}"` : '(空)')

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
          console.error('[LocalTranscriber] 进程启动错误:', error)
          resolve({
            success: false,
            error: `Whisper 进程启动失败: ${error.message}`
          })
        })

      } catch (error) {
        console.error('[LocalTranscriber] 转录异常:', error)
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

    // 合并文本并转换为简体中文
    const text = textParts.join(' ').trim()
    return this.toSimplifiedChinese(text)
  }

  /**
   * 将繁体中文转换为简体中文
   */
  private toSimplifiedChinese(text: string): string {
    if (toSimplifiedChinese) {
      try {
        return toSimplifiedChinese(text)
      } catch (error) {
        console.warn('[LocalTranscriber] 繁简转换失败:', error)
      }
    }
    // 如果转换器未初始化或转换失败，返回原文
    return text
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
