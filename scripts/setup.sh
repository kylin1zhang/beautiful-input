#!/bin/bash

# Typeless 项目设置脚本

set -e

echo "🚀 Typeless 项目设置"
echo "===================="
echo ""

# 检查 Node.js 版本
echo "📋 检查环境..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低，需要 18+，当前版本: $(node -v)"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装"
    exit 1
fi

echo "✅ npm 版本: $(npm -v)"
echo ""

# 安装依赖
echo "📦 安装依赖..."
npm install

echo ""
echo "✅ 依赖安装完成！"
echo ""

# 创建资源目录
echo "📁 创建资源目录..."
mkdir -p resources

echo ""
echo "🎉 设置完成！"
echo ""
echo "可用命令:"
echo "  npm run dev     - 启动开发模式"
echo "  npm run build   - 构建应用"
echo "  npm run dist    - 打包发布"
echo ""
echo "开始使用:"
echo "  1. 运行 npm run dev 启动应用"
echo "  2. 在设置中配置 API Keys"
echo "  3. 使用 Cmd/Ctrl+Shift+R 开始录音"
echo ""
