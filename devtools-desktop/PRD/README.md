# 项目文档

当前只保留正在执行或长期生效的文档。

## 现行执行基准（redesign-v2 全新设计落地）

- [全新设计落地实施计划](vue-migration/redesign-v2/implementation-plan.md)：批次划分、组件清单、交互原则与验收门禁。
- 设计基准：`design-preview/redesign-v2/`（冻结提交 `c74af73`，入口 `app/index.html`）。

## 长期生效的规则与清单

- [组件架构合规专项](vue-migration/component-architecture-compliance.md)：组件所有权边界与架构门禁的规则文档（长期生效）。
- [共享 UI 现状盘点](vue-migration/shared-ui-inventory.md)：Base* 公共组件清单与约束。
- `vue-migration/pages/*/assessment.md`：各业务页功能盘点，redesign-v2 落地时的功能对照清单（防止对照原型假数据漏功能），重构完成后随二轮清理移除。

## 历史文档（暂留）

- [Vue 3 架构渐进重构执行计划](vue3_architecture_migration_execution_plan.md)：已完成的架构迁移计划。合规专项仍引用其中的一致规则，待 redesign-v2 落地完成、规则并入合规文档后随二轮清理移除。

迁移期的一次性文档（各页 decision、页头审计、测试基线、手动 E2E 记录、旧设计原型等）已从工作区清理，需要时可从 Git 历史查阅；当前功能行为以代码、测试和上述文档为准。
