# Phase 9：旧架构清理 — 决策

> 状态：**P9-1～P9-3 已落地**（2026-08-12）
> 关联评估：[assessment.md](./assessment.md)

## 1. 确认方向

1. 分批清理，保持可运行；不一次删除 `app.js`。
2. 已完成：P9-1 孤儿清理；P9-2 Toast/介绍；**P9-3 桌面通知 + run WS 通知**。
3. 桌面通知权威在 Vue：`sendDesktopNotification` + `createDesktopNotificationService`。
4. run 通知并入 `run-runtime-service`（对账同一条 `run-status`），去掉 `__runActiveJob`。

## 2. 明确不做（P9-3 已遵守）

- 不删 `app.js` / `websocket.js` / `api.js`
- 不改 CM/xterm、不删 `overrides.css`、不改 Vite `publicDir`

## 3. 下一轮

按评估表执行 **P9-4**（`openFileInEditorByPath` / 主题 FOUC 收口后删 `app.js`）。
