# Phase 8：应用壳与 Router — 评估

> 状态：**Phase 8 代码收口完成（P8-1～P8-6）**（2026-08-12）；建议用户做一次 Tauri 冒烟（见 [decision.md](./decision.md)）
> 关联计划：[vue3_architecture_migration_execution_plan.md](../../../vue3_architecture_migration_execution_plan.md)
> 产出日期：2026-08-11

## 1. 现状（P8-6 后）

| 项 | 状态 |
| --- | --- |
| 入口 | `#app` → `AppShell`（AppLayout + RouterView KeepAlive + AppShellServices） |
| 导航权威 | Vue Router（hash）；托盘写 `#/run` |
| 离开契约 | Router `beforeEach` → `runPageLeaveGuards`（editor） |
| 主题 | Pinia 单一写入 + theme-bridge |
| 菜单序/折叠 | `route-meta` + `sidebar-chrome` |
| `MigrationHost` | 已删 |
| `app.js` 导航 | SIDEBAR/`switchPage`/`renderSidebar` 已删；保留 Toast/通知/WS/主题 FOUC/介绍弹窗 |

## 2. Phase 9 再清

- 整份 `app.js` / `api.js` / `websocket.js`
- vendor 进 npm、旧 `src` 静态树
- Toast / 通知 / 介绍弹窗彻底 Vue 化

## 3. 冒烟清单（用户）

14 页切换、前进后退、刷新 hash、editor 脏离开、FT/terminal 保活、deploy 三子页、托盘本地运行、主题/折叠/菜单序。

---

**下一阶段**：Phase 9 旧架构清理（或先完成上述冒烟）。
