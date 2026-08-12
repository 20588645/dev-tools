# Phase 9：旧架构清理 — 决策

> 状态：**P9-1～P9-4 已落地**（2026-08-12）
> 关联评估：[assessment.md](./assessment.md)

## 1. 确认方向

1. 分批清理，保持可运行。
2. 已完成：P9-1～P9-3；**P9-4 删除 `app.js`**。
3. 启动链：`websocket.js` 负责端口发现与 WS 连接；主题 FOUC 用 `index.html` 内联脚本；Pinia 仍是主题权威。
4. 实验功能与 upgrade 进度桥挂在 `AppShellServices`。

## 2. 明确不做（P9-4 已遵守）

- 不删 `websocket.js` / `api.js`（留给 P9-5）
- 不改 CM/xterm、不删 `overrides.css`、不改 Vite `publicDir`

## 3. 下一轮

按评估表执行 **P9-5**（`window.WS` → Vue/shared 模块；若无消费者则删 `websocket.js`/`api.js`）。
