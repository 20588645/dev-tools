# Phase 9：旧架构清理 — 评估

> 状态：**P9-1～P9-8 代码收口完成；G8 余用户侧发布验收**（2026-08-12）
> 关联计划：[vue3_architecture_migration_execution_plan.md](../../../vue3_architecture_migration_execution_plan.md)
> 关联决策：[decision.md](./decision.md)

## 1. 目标

删除迁移兼容层，满足 G7（旧架构移除）与 G8（正式发布验收）。保持软件持续可运行，分批推进。

## 2. 批次

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| P9-1 | 删 Sortable 等无消费者资产 | **已完成** |
| P9-2 | Toast + 项目介绍迁 Vue | **已完成** |
| P9-3 | 桌面通知 + run WS 通知路径 | **已完成** |
| P9-4 | 删 `app.js` | **已完成** |
| P9-5 | `window.WS` → Vue 共享模块；删 `websocket.js`/`api.js` | **已完成** |
| P9-6 | CM5/xterm → npm + 路由级懒加载 | **已完成** |
| P9-7 | 旧 CSS 吸收进 Vue 构建；删旧 `src` 树与 `publicDir` | **已完成**（用户 Tauri 冒烟通过） |
| P9-8 | legacy 目录收编 + 壳层 `!important` 归零 + E2E 翻新 + G7/G8 核对 | **代码收口完成** |

## 3. P9-8 落地摘要

- **`frontend/src/legacy/` 目录删除**，模块按域收编：
  `router/page-contract.ts`（13 页契约 + 离开守卫，符号更名 `APP_PAGE_IDS`/`AppPageId`）、
  `services/app-events.ts`（5 个应用事件 + upgrade 进度桥）、
  `views/deploy/add-project-events.ts`（添加项目跨页事件）、
  `components/shell/AppShellServices.vue`；
  死桥删除：`theme-bridge`（`__devtoolsApplyThemeMode` 调用方随 app.js 已亡）、
  `window.showAddProject`（旧页头 onclick 桥）
- **壳层 `!important` 归零**：`styles/legacy/layout.css` 203 处全删（压制目标 style.css 已死），
  AppLayout/AppShell 40 处成对移除（靠 `.is-collapsed` 前缀特异性胜出，层叠胜负逐条核对不变）；
  顺带修正折叠态工具按钮特异性败诉（宽度现为设计值 34px）
- **E2E 翻新并全量跑通（66 项）**：宿主选择器 `#vue-*-host` → `#page-*` + View 根类；
  主题菜单选择 → 侧栏循环按钮（`data-test="theme-toggle"`）；
  修复 `expectNoPageOverflow` 的结构性误判（P8 后 `#page-x` 与 `.x-view` 为同一元素，
  子树 `querySelector` 返回 null 恒判溢出）
- E2E 运行环境备忘：测试 Sidecar 需 Node 18（`~/.nvm/versions/node/v18.20.4`，
  better-sqlite3 按其编译）：`DEVTOOLS_TEST=1 <node18> sidecar/index.js`（端口 13900）

## 4. G7 核对（旧架构移除）

| 项 | 状态 |
| --- | --- |
| `app.js` / 旧页面脚本 / 内联事件 / 旧页面 DOM | ✅ 全删 |
| `overrides.css` 与无消费者 CSS | ✅ 全删（P9-7 审计瘦身） |
| `window.*` 业务函数 | ✅ 生产零残留 |
| 组件/视图代码未登记 `!important` | ✅ **0 处** |
| 登记例外 ≤10 | ⚠️ 组件侧例外 0；`styles/legacy` 过渡目录尚存约 146 处（base 4 / components 88 / runtime 54），随目录 token 化归零——**G7 完全关闭的唯一欠账** |

## 5. G8 核对（发布验收）

| 项 | 状态 |
| --- | --- |
| lint / lint:tokens / CSS 基线 / typecheck | ✅ |
| test:unit（438） / test:e2e（66） | ✅ |
| build:frontend | ✅（主包 490KB，CM/xterm 独立 chunk） |
| `npm run build` 正式打包 / macOS 安装启动 / Sidecar 拉起退出 / 数据兼容 / 旧版本升级 | ⏳ **需用户执行** |

## 6. 后续

1. 用户执行正式打包与升级回归（G8 收尾）。
2. 独立批次：`styles/legacy` 全面 token 化（G7 完全关闭 + 例外归零）。
