#!/usr/bin/env node

/**
 * 图标生成脚本
 * 
 * 此脚本使用 Canvas API 生成简单的应用图标
 * 实际项目中建议使用设计工具创建专业的图标
 */

const fs = require('fs')
const path = require('path')
const { createCanvas } = require('canvas')

const SIZES = [16, 32, 48, 128, 256, 512, 1024]
const OUTPUT_DIR = path.join(__dirname, '../resources')

// 确保输出目录存在
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

// 生成图标
function generateIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // 背景渐变
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, '#3B82F6')
  gradient.addColorStop(1, '#8B5CF6')

  // 绘制圆形背景
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()

  // 绘制麦克风图标（简化版）
  const centerX = size / 2
  const centerY = size / 2
  const scale = size / 64

  ctx.fillStyle = 'white'
  ctx.strokeStyle = 'white'
  ctx.lineWidth = 3 * scale

  // 麦克风头
  const headWidth = 20 * scale
  const headHeight = 24 * scale
  const headX = centerX - headWidth / 2
  const headY = centerY - headHeight / 2 - 4 * scale

  ctx.beginPath()
  ctx.roundRect(headX, headY, headWidth, headHeight, [10 * scale])
  ctx.fill()

  // 麦克风支架
  const stemWidth = 6 * scale
  const stemHeight = 10 * scale
  const stemX = centerX - stemWidth / 2
  const stemY = headY + headHeight

  ctx.fillRect(stemX, stemY, stemWidth, stemHeight)

  // 麦克风底座
  const baseWidth = 24 * scale
  const baseHeight = 4 * scale
  const baseX = centerX - baseWidth / 2
  const baseY = stemY + stemHeight

  ctx.fillRect(baseX, baseY, baseWidth, baseHeight)

  // 保存为 PNG
  const buffer = canvas.toBuffer('image/png')
  const filename = size === 1024 ? 'icon.png' : `icon-${size}.png`
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), buffer)

  console.log(`✓ Generated ${filename}`)
}

// 生成托盘图标（简化版）
function generateTrayIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // 透明背景
  ctx.clearRect(0, 0, size, size)

  // 绘制麦克风图标
  const centerX = size / 2
  const centerY = size / 2
  const scale = size / 16

  ctx.fillStyle = '#3B82F6'

  // 麦克风头
  const headWidth = 8 * scale
  const headHeight = 10 * scale
  const headX = centerX - headWidth / 2
  const headY = centerY - headHeight / 2 - 2 * scale

  ctx.beginPath()
  ctx.roundRect(headX, headY, headWidth, headHeight, [3 * scale])
  ctx.fill()

  // 支架
  const stemWidth = 2 * scale
  const stemHeight = 4 * scale
  const stemX = centerX - stemWidth / 2
  const stemY = headY + headHeight

  ctx.fillRect(stemX, stemY, stemWidth, stemHeight)

  // 底座
  const baseWidth = 10 * scale
  const baseHeight = 2 * scale
  const baseX = centerX - baseWidth / 2
  const baseY = stemY + stemHeight

  ctx.fillRect(baseX, baseY, baseWidth, baseHeight)

  // 保存
  const buffer = canvas.toBuffer('image/png')
  const filename = size === 32 ? 'tray-icon.png' : 'tray-icon@2x.png'
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), buffer)

  console.log(`✓ Generated ${filename}`)
}

// 主函数
async function main() {
  console.log('Generating icons...\n')

  try {
    // 生成应用图标
    for (const size of SIZES) {
      generateIcon(size)
    }

    // 生成托盘图标
    generateTrayIcon(16)
    generateTrayIcon(32)

    console.log('\n✅ All icons generated successfully!')
    console.log(`📁 Output directory: ${OUTPUT_DIR}`)
  } catch (error) {
    console.error('❌ Error generating icons:', error)
    process.exit(1)
  }
}

main()
