# Phase 9：旧架构清理 — 评估

> 状态：**P9-1～P9-6 已完成**（2026-08-12）
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
| P9-6 | CM5/xterm → npm + 路由级懒加载；删 `src/js` vendor | **已完成** |
| P9-7 | overrides / publicDir / 旧 `src` 静态树 | 待办 |
| P9-8 | rename legacy + G7/G8 | 待办 |

## 3. P9-6 落地摘要

- npm 依赖：`codemirror@5.65`（锁 5 系）、`@xterm/xterm@5.5` + fit/search/webgl addon（锁 5 系，与 vendor 行为对齐，不顺带升 6）
- `views/editor/codemirror-loader.ts`：与旧 `cm.bundle` **逐项对齐**（core + dialog/closebrackets/matchbrackets/search 三件套/active-line + 14 mode + material-darker），随编辑器路由 chunk 懒加载（FileEditorView 461KB）
- `services/terminal-xterm-loader.ts`：xterm 四包 + 官方 CSS 独立 chunk（406KB），`bootFromSessions` 挂载时 `ensureXtermLoaded()` 动态 import
- 删除 `src/js/vendor/`、`src/js/xterm*.js`、`src/css/xterm.css` 与 `index.html` 引用；`src/js` 目录清空
- 主包体积不变（490KB），CM/xterm 均不进主包
- 门禁修复：粒子色板移入 `legacy-runtime.css` 变体类（token 审计归零）；`AppLayout` 删除 `#666` fallback；P8 壳层 40 处 `!important` 以块级注释**登记例外**（见 §5）

## 4. 仍依赖经典资产（P9-6 后）

- 旧 CSS 静态树（`src/css/`）与 `overrides.css`、Vite `publicDir` → 仓库 `src/`——P9-7
- `src/` 下已无任何 JS

## 5. 登记例外（P9-7 归零）

- `AppLayout.vue` / `AppShell.vue` 共 40 处 `declaration-no-important`：压制 `src/css/layout.css` 旧侧栏与 `.page` 显隐规则所需；P9-7 吸收 legacy-runtime、删除旧 CSS 后随之删除。
