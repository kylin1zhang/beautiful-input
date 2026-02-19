@echo off
chcp 65001 >nul

REM Typeless 项目设置脚本 (Windows)

echo 🚀 Typeless 项目设置
echo ====================
echo.

REM 检查 Node.js
echo 📋 检查环境...
node -v >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js 未安装，请先安装 Node.js 18+
    exit /b 1
)

for /f "tokens=1" %%a in ('node -v') do set NODE_VERSION=%%a
set NODE_MAJOR=%NODE_VERSION:~1,2%

if %NODE_MAJOR% LSS 18 (
    echo ❌ Node.js 版本过低，需要 18+，当前版本: %NODE_VERSION%
    exit /b 1
)

echo ✅ Node.js 版本: %NODE_VERSION%

REM 检查 npm
npm -v >nul 2>&1
if errorlevel 1 (
    echo ❌ npm 未安装
    exit /b 1
)

echo ✅ npm 版本: 
for /f "tokens=1" %%a in ('npm -v') do echo %%a
echo.

REM 安装依赖
echo 📦 安装依赖...
npm install
if errorlevel 1 (
    echo ❌ 依赖安装失败
    exit /b 1
)

echo.
echo ✅ 依赖安装完成！
echo.

REM 创建资源目录
echo 📁 创建资源目录...
if not exist resources mkdir resources

echo.
echo 🎉 设置完成！
echo.
echo 可用命令:
echo   npm run dev     - 启动开发模式
echo   npm run build   - 构建应用
echo   npm run dist    - 打包发布
echo.
echo 开始使用:
echo   1. 运行 npm run dev 启动应用
echo   2. 在设置中配置 API Keys
echo   3. 使用 Ctrl+Shift+R 开始录音
echo.

pause
