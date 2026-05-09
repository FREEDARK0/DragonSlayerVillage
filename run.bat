@echo off
cd /d "%~dp0"

echo ================================
echo   屠龙村庄 DragonSlayerVillage
echo ================================
echo.

where npm >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit
)

if not exist "node_modules\" (
    echo [首次运行] 正在安装依赖，请稍候...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit
    )
    echo.
)

echo 正在启动游戏，浏览器将自动打开...
echo 关闭此窗口即可停止游戏。
echo.

npx vite --open --host 0.0.0.0 --port 3000
pause
