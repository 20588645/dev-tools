# Phase 9：旧架构清理 — 评估

> 状态：**P9-1～P9-3 已完成**（2026-08-12）
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
| P9-4 | 删 `app.js`（open-editor / 主题 FOUC 收口） | 待办 |
| P9-5 | `window.WS` → Vue 模块；删 websocket/api | 待办 |
| P9-6 | CM5/xterm → npm | 待办 |
| P9-7 | overrides / publicDir / 旧 `src` 静态树 | 待办 |
| P9-8 | rename legacy + G7/G8 | 待办 |

## 3. P9-1～P9-3 落地摘要

- 删除 `src/js/sortable.min.js`；Toast / 项目介绍迁 Vue（P9-1/P9-2）
- `services/desktop-notification.ts`：权限、Tauri/Web、点回日志；AppShellServices 常驻
- `run-runtime-service`：run 成功 / 编译报错通知；删除 `__runActiveJob`
- 部署 / 待办 / 文件传输改直接调用 Vue `sendDesktopNotification`
- `app.js` 仅剩 upgrade-progress WS 桥，以及 open-editor / 主题 / sysDialog 等

## 4. 仍依赖经典脚本（P9-3 后）

- `app.js`：`openFileInEditorByPath`、主题 FOUC/菜单、`#sysDialog`、upgrade-progress 事件桥、实验功能兼容
- `websocket.js` / `api.js`：`window.WS`
- CM5 / xterm 全局脚本
