#!/usr/bin/env node

/**
 * 平台图标生成脚本
 *
 * 从现有的 PNG 图标生成：
 * - icon.ico (Windows)
 * - icon.icns (macOS) - 在 Windows 上生成简化版本
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pngToIco from 'png-to-ico'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const RESOURCES_DIR = path.join(__dirname, '../resources')

// ICO 需要的尺寸 (NSIS 支持的最大尺寸是 256x256)
const ICO_SIZES = [16, 32, 48, 64, 128, 256]

// ICNS 需要的尺寸
const ICNS_SIZES = [16, 32, 64, 128, 256, 512]

async function generateIco() {
  console.log('生成 Windows ICO 图标...')

  const pngBuffers = []

  for (const size of ICO_SIZES) {
    const iconPath = path.join(RESOURCES_DIR, `icon-${size}.png`)
    if (fs.existsSync(iconPath)) {
      const buffer = fs.readFileSync(iconPath)
      pngBuffers.push(buffer)
      console.log(`  ✓ 读取 icon-${size}.png`)
    } else {
      console.warn(`  ⚠ 跳过 icon-${size}.png (文件不存在)`)
    }
  }

  // 注意：不添加 512x512 图标，NSIS 不支持大于 256x256 的图标

  if (pngBuffers.length === 0) {
    throw new Error('没有找到任何 PNG 图标文件')
  }

  const icoBuffer = await pngToIco(pngBuffers)
  const icoPath = path.join(RESOURCES_DIR, 'icon.ico')
  fs.writeFileSync(icoPath, icoBuffer)

  console.log(`  ✅ 生成 icon.ico (${(icoBuffer.length / 1024).toFixed(1)} KB)`)
}

async function generateIcns() {
  console.log('\n生成 macOS ICNS 图标...')

  // 在 Windows 上，我们无法直接生成真正的 ICNS 文件
  // 但 electron-builder 可以接受一个包含所有尺寸 PNG 的目录
  // 或者我们可以使用 electron-icon-builder

  // 检查是否已有 icns 文件
  const icnsPath = path.join(RESOURCES_DIR, 'icon.icns')
  if (fs.existsSync(icnsPath)) {
    console.log('  ✓ icon.icns 已存在，跳过生成')
    return
  }

  // 创建 icon.iconset 目录 (macOS icns 的源目录结构)
  const iconsetDir = path.join(RESOURCES_DIR, 'icon.iconset')
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true })
  }

  // ICNS 的标准命名规则
  const iconMapping = {
    'icon_16x16.png': 'icon-16.png',
    'icon_16x16@2x.png': 'icon-32.png',
    'icon_32x32.png': 'icon-32.png',
    'icon_32x32@2x.png': 'icon-64.png',
    'icon_128x128.png': 'icon-128.png',
    'icon_128x128@2x.png': 'icon-256.png',
    'icon_256x256.png': 'icon-256.png',
    'icon_256x256@2x.png': 'icon.png',
    'icon_512x512.png': 'icon.png',
    'icon_512x512@2x.png': 'icon.png'
  }

  let copiedCount = 0
  for (const [targetName, sourceName] of Object.entries(iconMapping)) {
    const sourcePath = path.join(RESOURCES_DIR, sourceName)
    const targetPath = path.join(iconsetDir, targetName)

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, targetPath)
      copiedCount++
    }
  }

  console.log(`  ✓ 创建 icon.iconset 目录 (${copiedCount} 个图标文件)`)

  // 在 Windows 上无法生成真正的 .icns，提示用户
  if (process.platform === 'win32') {
    console.log('\n  ⚠ 注意: 在 Windows 上无法生成 .icns 文件')
    console.log('  解决方案:')
    console.log('  1. electron-builder 会自动使用 PNG 图标作为后备')
    console.log('  2. 或在 macOS 上运行: iconutil -c icns icon.iconset')
    console.log('  3. 或使用在线工具转换 icon.iconset 目录')
  }
}

async function main() {
  console.log('='.repeat(50))
  console.log('平台图标生成工具')
  console.log('='.repeat(50))
  console.log()

  try {
    await generateIco()
    await generateIcns()

    console.log('\n' + '='.repeat(50))
    console.log('✅ 图标生成完成!')
    console.log('='.repeat(50))
    console.log(`\n📁 输出目录: ${RESOURCES_DIR}`)
    console.log('\n生成的文件:')
    console.log('  - icon.ico (Windows)')
    console.log('  - icon.iconset/ (macOS ICNS 源文件)')
  } catch (error) {
    console.error('\n❌ 错误:', error.message)
    process.exit(1)
  }
}

main()
