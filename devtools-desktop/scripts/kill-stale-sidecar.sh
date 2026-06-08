#!/bin/sh
# 清理残留 Sidecar 进程（保留当前正在服务的；忽略测试沙箱 --test 进程）
ALL_PIDS=$(ps -Ao pid,command | grep "devtools-desktop/sidecar/index.js" | grep -v -- "--test" | grep -v grep | awk '{print $1}')

if [ -z "$ALL_PIDS" ]; then
  echo "未发现任何正式 Sidecar 进程，无需清理"
  exit 0
fi

# 当前 sidecar 就是最先出现的那个（PID 最小的通常是主 sidecar）
CURRENT_PID=$(echo "$ALL_PIDS" | head -1)
STALE=$(echo "$ALL_PIDS" | grep -v "^${CURRENT_PID}$")

if [ -z "$STALE" ]; then
  echo "✅ 仅有当前正在服务的 Sidecar（PID ${CURRENT_PID}），无残留"
else
  COUNT=$(echo "$STALE" | wc -l | tr -d ' ')
  echo "检测到 ${COUNT} 个残留 Sidecar 进程，正在清理..."
  echo "$STALE" | xargs kill -9 2>/dev/null
  echo "✅ 已强制终止残留进程 PID: $(echo $STALE | tr '\n' ' ')"
fi
