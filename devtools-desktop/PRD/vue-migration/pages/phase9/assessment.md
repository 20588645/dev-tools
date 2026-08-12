# Phase 9：旧架构清理 — 评估

> 状态：**P9-1～P9-4 已完成**（2026-08-12）
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
| P9-5 | `window.WS` → Vue 模块；删 websocket/api | 待办 |
| P9-6 | CM5/xterm → npm | 待办 |
| P9-7 | overrides / publicDir / 旧 `src` 静态树 | 待办 |
| P9-8 | rename legacy + G7/G8 | 待办 |

## 3. P9-4 落地摘要

- `openInEditor`（`run-service`）替代 `window.openFileInEditorByPath`
- `experimental-effects-service`：Live2D / 点击粒子；响应设置页事件
- `installUpgradeProgressBridge`：WS `upgrade-progress` → window 事件
- `index.html` 内联主题 FOUC；删除 `#sysDialog` 与 `js/app.js` 引用
- `websocket.js`：接管 `initAPI` + `WS.connect` 与 sidecar 重启重连
- `sync-version.js` 不再同步 `APP_VERSION`；**`src/js/app.js` 已删除**

## 4. 仍依赖经典脚本（P9-4 后）

- `api.js` / `websocket.js`：共享 WS + 端口发现（供 Vue 服务经 `window.WS` 订阅）
- CM5 / xterm 全局脚本
- 旧 CSS 静态树与 `overrides.css`（P9-7）
