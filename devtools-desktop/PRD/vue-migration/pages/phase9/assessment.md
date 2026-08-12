# Phase 9：旧架构清理 — 评估

> 状态：**P9-1～P9-7 已完成**（2026-08-12）
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
| P9-7 | 旧 CSS 吸收进 Vue 构建；删 `overrides.css`/`publicDir`/旧 `src` 树 | **已完成** |
| P9-8 | rename legacy + G7/G8 全量验收 | 待办 |

## 3. P9-7 落地摘要

- **消费者审计驱动瘦身**：对 10 个旧 CSS 文件逐类反查 Vue 模板/TS 引用；
  `badge.css`/`button.css`/`card.css`/`state.css` 零消费者**整文件删除**；
  `overrides.css` 活规则并入 runtime 承接文件后**整文件删除**
- **吸收结构** `frontend/src/styles/legacy/`：`base.css`（旧变量体系，原样）、
  `layout.css`（删 menu-order/theme-mode/todo-group/sticky/`body.sidebar-collapsed` 死段）、
  `components.css`（删旧按钮/弹窗/toast/表格等 44 死类段）、`segmented.css`（删 `--sm`）、
  `runtime.css`（intro/browser/waifu/粒子 + overrides 活段）；`index.css` 保持原 link 顺序，
  `main.ts` 在 tokens 之前引入
- 规模：3357 行 → 1665 行（约 −50%）；重复选择器基线 23 → 12（脚本已收紧）
- **删除**：仓库 `src/` 整树、Vite `publicDir` 配置、`index.html` 全部静态 CSS link、
  过时的 `scripts/css-audit.js`
- 门禁跟随：基线脚本改扫新路径；token 审计豁免 `styles/legacy`（过渡目录）；
  legacy 目录用子级 `.stylelintrc.json` 隔离 `declaration-no-important`；
  migration stylelint 用 `--ignore-pattern` 排除 legacy

## 4. 关键判定依据（复核时用）

- `body.sidebar-collapsed` 死：AppShell `useSidebarChrome({ syncBody: false })`，body 类无人写入；折叠态由 `AppLayout .is-collapsed` 承担
- `#page-*` id 全按活处理：RouterView 根动态拼 `page-${pageId}`
- 死判据：类名在 `frontend/src/**/*.{vue,ts}` + `index.html` 中无字面/前缀出现

## 5. 登记例外（G7 归零）

- `AppLayout.vue` / `AppShell.vue` 共 40 处 `declaration-no-important`：压制 `styles/legacy/layout.css` 旧壳层规则所需
- `styles/legacy/` 目录整体：旧变量体系 + 12 个重复选择器基线，随页面样式全面 token 化删除

## 6. 建议

本轮动了全站样式装载方式（link → bundle），**强烈建议在 P9-8 前做一次真实 Tauri 冒烟**（亮暗主题、侧栏折叠、四档窗口、编辑器/终端懒加载）。
