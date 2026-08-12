# Phase 9：旧架构清理 — 决策

> 状态：**P9-1～P9-6 已落地**（2026-08-12）
> 关联评估：[assessment.md](./assessment.md)

## 1. 确认方向

1. 分批清理，保持可运行。
2. 已完成：P9-1～P9-5；**P9-6 CM5/xterm 归 npm 并按路由懒加载**，`src/` 下 JS 归零。
3. 版本策略：CM 锁 5 系、xterm 锁 5.5 系——P9-6 是搬运不是升级，与 vendor 行为对齐。
4. P8 壳层 `!important` 以登记例外过渡，P9-7 收口归零（见 assessment §5）。

## 2. 明确不做（P9-6 已遵守）

- 不升 CM6 / xterm 6
- 不删 `overrides.css`、不改 Vite `publicDir`（P9-7）

## 3. 下一轮

按评估表执行 **P9-7**（吸收 `legacy-runtime`；删 `overrides.css`；改 Vite `publicDir`；删旧 `src` 静态树）。
