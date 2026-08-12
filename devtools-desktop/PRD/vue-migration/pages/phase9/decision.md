# Phase 9：旧架构清理 — 决策

> 状态：**已关闭（G7/G8 通过，用户发布验收完成）**（2026-08-12）
> 关联评估：[assessment.md](./assessment.md)

## 1. 确认方向

1. 分批清理，保持可运行；P9-7 后经用户真实 Tauri 冒烟。
2. P9-8 收编原则：模块按域归位（router / services / views/deploy / components/shell），
   `legacy` 一词自源码目录退役；仅 `styles/legacy` 作为显式登记的样式过渡目录保留。
3. 壳层层叠契约：`styles/legacy/layout.css` 与 AppLayout/AppShell 均无 `!important`，
   覆盖关系完全由特异性表达。
4. E2E 是 G8 的自动化基线：66 项全绿；运行方式见 assessment §3 备忘。

## 2. G7/G8 口径

- G7 除 `styles/legacy` 目录（约 146 处 `!important` + 12 个重复选择器基线 + 旧变量体系）外全部达成；
  该目录为**唯一显式欠账**，随后续 token 化批次归零。
- G8 本地可验项全绿；正式打包、安装、升级与数据兼容验收由用户执行。

## 3. 结论

1. 用户已完成正式打包、安装、升级与数据兼容验收（2026-08-12）——**G8 通过，Phase 9 关闭**。
2. 迁移后长期项：`styles/legacy` token 化（关闭 G7 例外欠账），随日常打磨渐进推进。
