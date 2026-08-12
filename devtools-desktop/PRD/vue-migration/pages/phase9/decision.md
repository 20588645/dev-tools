# Phase 9：旧架构清理 — 决策

> 状态：**P9-1 + P9-2 已落地**（2026-08-12）
> 关联评估：[assessment.md](./assessment.md)

## 1. 确认方向

1. 分批清理，保持可运行；不一次删除 `app.js`。
2. 本轮已完成：**P9-1 孤儿清理 + P9-2 Toast/介绍迁 Vue**。
3. Toast 走 Pinia notification + Naive Message；可点击 toast 派发 `devtools:log-reopen-requested`。
4. 项目介绍用 Vue `BaseDialog`，从 `index.html` 移除 `#projectIntroModal`。

## 2. 明确不做（本轮，已遵守）

- 不删 `app.js` / `websocket.js` / `api.js`
- 不迁桌面通知、不改 CM/xterm、不删 `overrides.css`
- 不改 Vite `publicDir`

## 3. 下一轮

按评估表执行 **P9-3**（桌面通知 + run WS 通知路径迁 Vue）。
