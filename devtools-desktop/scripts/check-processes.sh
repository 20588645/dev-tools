#!/bin/sh
# DevTools 进程健康检查脚本
echo "===== DevTools 运行进程检查 ====="
echo ""
echo "[ 前端 App 主进程 ]"
ps -Ao pid,ppid,etime,command | grep "DevTools.app/Contents/MacOS/app" | grep -v grep || echo "  (未检测到，前端未运行)"
echo ""
echo "[ 后端 Sidecar 进程 ]"
ps -Ao pid,ppid,etime,command | grep "devtools-desktop/sidecar/index.js" | grep -v grep || echo "  (未检测到，后端未运行)"
echo ""

FE=$(ps -Ao command | grep "DevTools.app/Contents/MacOS/app" | grep -v grep | wc -l | tr -d ' ')
BE=$(ps -Ao command | grep "devtools-desktop/sidecar/index.js" | grep -v grep | wc -l | tr -d ' ')

echo "---- 统计：前端 ${FE} 个 / 后端 ${BE} 个 ----"
if [ "$FE" = "1" ] && [ "$BE" = "1" ]; then
  echo "✅ 进程干净（1 前端 + 1 后端），无残留"
else
  echo "⚠️  数量异常，可能有旧进程/脏进程残留，建议彻底退出后重开"
fi
