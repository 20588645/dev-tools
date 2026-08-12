# Phase 9：旧架构清理 — 决策

> 状态：**P9-1～P9-5 已落地**（2026-08-12）
> 关联评估：[assessment.md](./assessment.md)

## 1. 确认方向

1. 分批清理，保持可运行。
2. 已完成：P9-1～P9-4；**P9-5 WS/API 全部归 Vue**（`services/realtime.ts` + `api-client.ts`），`src/js` 仅剩 CM5/xterm vendor。
3. 共享连接单一实例：`startRealtime()` 于 `main.ts` 挂载前建立；服务经 `realtimeWs()` 订阅，`globalThis.WS` 仅作测试注入缝。
4. 实验功能与 upgrade 进度桥挂在 `AppShellServices`（P9-4 定）。

## 2. 明确不做（P9-5 已遵守）

- 不改 CM/xterm（P9-6）、不删 `overrides.css`、不改 Vite `publicDir`（P9-7）

## 3. 下一轮

按评估表执行 **P9-6**（CodeMirror 5 / xterm 迁 npm + 路由级懒加载；删 `src/js` vendor）。
