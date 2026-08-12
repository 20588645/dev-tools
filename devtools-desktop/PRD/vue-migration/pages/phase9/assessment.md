# Phase 9：旧架构清理 — 评估

> 状态：**P9-1～P9-5 已完成**（2026-08-12）
> 关联计划：[vue3_architecture_migration_execution_plan.md](../../../vue3_architecture_migration_execution_plan.md)
> 关联决策：[decision.md](./decision.md)

## 1. 目标

删除迁移兼容层，满足 G7（旧架构移除）与 G8（正式发布验收）。保持软件持续可运行，分批推进。

## 2. 批次

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| P9-1 | 删 Sortable 等无消费者资产；建本页评估/决策 | **已完成** |
| P9-2 | Toast + 项目介绍迁 Vue | **已完成** |
| P9-3 | 桌面通知 + run WS 通知路径 | **已完成** |
| P9-4 | 删 `app.js`（open-editor / 主题 FOUC / 实验功能 / upgrade 桥） | **已完成** |
| P9-5 | `window.WS` → Vue 共享模块；删 `websocket.js`/`api.js` | **已完成** |
| P9-6 | CM5/xterm → npm | 待办 |
| P9-7 | overrides / publicDir / 旧 `src` 静态树 | 待办 |
| P9-8 | rename legacy + G7/G8 | 待办 |

## 3. P9-5 落地摘要

- 新增 `services/realtime.ts`：`RealtimeAdapter` 包装既有 `WebSocketClient`（指数退避、`open` 事件），保留旧 `on/off` 形状 + `send`/`connected`；`main.ts` 启动单例
- 端口发现复用 `apiClient.initialize()`；`devtools:sidecar-restarted` → 重连新端口
- 六个消费方（run/deploy/terminal/filetransfer 服务、`useRunRealtime`、upgrade 桥）改经 `realtimeWs()` 订阅；`globalThis.WS` 仅保留为**测试注入缝**，生产不再挂全局
- `frontend-error` 上报自 `index.html` 内联脚本迁入 realtime 模块
- 删除 `src/js/api.js`、`src/js/websocket.js` 与 `index.html` 引用；`lint:js` 目标去掉 `src/js`
- 顺带清理：`__devtoolsShowToast` 桥（app.js 删除后无消费者）；`useDeployRealtime.test` 补桌面通知 mock（消除遗留未处理拒绝）；`route-meta.ts` 声明合并加 lint 豁免

## 4. 仍依赖经典资产（P9-5 后）

- CM5 / xterm 全局脚本（`src/js/vendor/`、`src/js/xterm*.js`）——P9-6
- 旧 CSS 静态树与 `overrides.css`、Vite `publicDir` → 仓库 `src/`——P9-7
