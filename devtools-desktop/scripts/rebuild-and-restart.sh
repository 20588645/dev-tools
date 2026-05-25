#!/bin/bash
# DevTools Desktop 重新打包并重启脚本
# 此脚本由 Sidecar 通过 nohup 启动，独立于主进程运行

PROJECT_DIR="/Users/ldy/personalTools/devtools-desktop"
APP_NAME="DevTools"
APP_DEST="/Applications/${APP_NAME}.app"
LOG_FILE="${PROJECT_DIR}/scripts/rebuild.log"

exec > "$LOG_FILE" 2>&1
echo "========== 开始重新打包 $(date) =========="

# 1. 进入项目目录并拉取最新代码
echo "[1/5] git pull..."
cd "/Users/ldy/personalTools"
git pull origin dev

# 2. 打包
echo "[2/5] 开始打包..."
cd "$PROJECT_DIR"
npm run build
if [ $? -ne 0 ]; then
  echo "[ERROR] 打包失败！"
  exit 1
fi

# 3. 杀掉当前正在运行的 app 和 sidecar
echo "[3/5] 停止当前运行的 DevTools..."

# 先用 osascript 优雅退出 app（会触发 Tauri 关闭 sidecar）
osascript -e 'quit app "DevTools"' 2>/dev/null
sleep 3

# 强杀 app 主进程
pkill -9 -f "${APP_NAME}.app/Contents/MacOS" 2>/dev/null

# 强杀所有 sidecar 相关的 node 进程
pkill -9 -f "devtools-desktop/sidecar" 2>/dev/null
# 兜底：按端口找
lsof -ti:13456 2>/dev/null | xargs kill -9 2>/dev/null

sleep 2

# 等待所有相关进程完全消失
for i in {1..15}; do
  APP_ALIVE=$(pgrep -f "${APP_NAME}.app/Contents/MacOS" 2>/dev/null)
  SIDECAR_ALIVE=$(pgrep -f "devtools-desktop/sidecar" 2>/dev/null)
  if [ -z "$APP_ALIVE" ] && [ -z "$SIDECAR_ALIVE" ]; then
    echo "  所有进程已退出"
    break
  fi
  echo "  等待进程退出... ($i)"
  kill -9 $APP_ALIVE $SIDECAR_ALIVE 2>/dev/null
  sleep 1
done

# 4. 安装新版本
echo "[4/5] 安装新版本..."
rm -rf "$APP_DEST"
cp -R "${PROJECT_DIR}/src-tauri/target/release/bundle/macos/${APP_NAME}.app" "$APP_DEST"
sleep 1

# 5. 重新启动
echo "[5/5] 启动新版本..."
open "$APP_DEST"

echo "========== 完成 $(date) =========="
