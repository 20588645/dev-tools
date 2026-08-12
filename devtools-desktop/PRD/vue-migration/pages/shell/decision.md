# Phase 8：应用壳与 Router — 决策

> 状态：**Phase 8 P8-1～P8-6 代码收口完成**（2026-08-12）；Phase 9 已启动（P9-1/P9-2 完成）
> 关联评估：[assessment.md](./assessment.md)
> 产出日期：2026-08-11

本文含壳层批次与离开契约冻结范围。

## 0. 用户确认结论（2026-08-11）

用户回复「确认」，采纳推荐方向：P8-1→P8-6、离开契约冻结、侧栏等价迁移、立即开始 P8-1。

## 1. 推荐方向（已执行）

见历史：routes → leave → AppLayout → 主题/菜单 → cutover → 收口。

## 8. P8-5 完成记录（2026-08-12）

完整 B cutover：`#app` + AppShell + RouterView；删 MigrationHost；DeployChrome；托盘 hash；`switchPage` 曾降级为 hash。

## 9. P8-6 完成记录（2026-08-12）

**死代码清理**

- `app.js`：删除 `SIDEBAR_MENU_ITEMS` / `renderSidebar` / `switchPage` / `switchSubTab` / 折叠 HTML API / `emitLegacyPageActivation` / sticky header 助手；`setupVueCompatBridge` 仅保留实验功能/sidecar/超时
- `legacy-bridge`：删除 page-activation / subtab / leave window bridge；保留 leave register/run、home-refresh、菜单序事件、`requestLegacyPage` 别名
- `layout.css`：删除 `#vue-migration-host` 规则；`#vue-ipcheck-host` 兼作 `#page-ipcheck`

**仍留 Phase 9**：整份 `app.js`、桌面通知、vendor、WS 等（Toast/介绍弹窗已于 P9-2 迁出）。

**Gate**：Phase 9 分批推进中；见 `pages/phase9/`。
