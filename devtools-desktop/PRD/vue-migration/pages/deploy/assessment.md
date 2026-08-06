# 部署面板页面迁移评估

> 状态：**PG0 已完成（2026-08-06）**，PG1 代码研究进行中
> 关联决策：decision.md（PG2 完成后产出）
> 产出日期：2026-08-06

本文只做运行态取证与代码研究，不提方案、不改代码。方案与分级见 decision.md。

## 1. 页面规模

| 项 | 数量 |
| --- | ---: |
| `src/js/deploy.js` | 1632 行 |
| `src/css/pages/deploy.css` | 936 行 |
| 全局函数 | 87 个 |
| 内联 `onclick` 入口 | 22 个 |
| 模块级可变状态 | 13 个（含 4 个 `Set`、1 个 `modalState` 对象） |
| 子页 | 3 个（项目总览 / 服务器管理 / 部署历史） |
| 弹窗相关引用 | 11 处 |

迁移矩阵标注为「很高复杂度」，是剩余页面中体量最大的一个。

## 2. 对 legacy 全局的依赖

`deploy.js` 直接调用以下 `app.js` 全局，迁移时必须逐项替换为 Vue 侧等价物：

| 全局 | 引用次数 | 迁移方向 |
| --- | ---: | --- |
| `escapeHtml` | 37 | 模板渲染替代，Vue 插值自带转义，多数可直接消失 |
| `API` | 30 | 类型化 Service（CA-06 要求 View 不得直接 fetch） |
| `showToast` | 9 | 已有通知适配层，改用 `useNotificationStore` |
| `showConfirm` | 6 | 已有 `ConfirmDialog` 公共组件 |
| `openLogViewer` | 3 | 已有公共 LogViewer，删 `legacy/log-viewer-bridge.ts` |
| `showPrompt` | 1 | 公共输入弹窗 |
| `loadRunStatuses` | 1 | 收敛进 Vue run store |

`allProjects`、`allServers`、`runningProjects`、`switchPage` 均为 0 引用——此前的耦合判断需按此修正：`runningProjects` 的消费者是 `app.js` 的托盘菜单与首页，不是部署面板。

## 3. PG0 运行态取证（2026-08-06）

正式 Sidecar（`13456`）只读取证，未点击任何构建、部署、删除或强释按钮。取证覆盖 1665×1184 与 900×600、亮暗主题、三个子页。

实测数据：10 个项目、6 个分组、7 台服务器、122 条部署历史（121 成功 / 1 失败）。三档尺寸下 `document` 与 `#page-deploy` 均无横向溢出；项目卡高度统一为 230px。

### 3.1 已确认缺陷

**D1（高）分组头样式孤儿。** `src/css/pages/run.css` 在 `2f1b93d` 随本地运行页迁移整体删除，其中包含 `.run-group-header` / `-chevron` / `-name` / `-count` / `-move` / `-menu` 六个类的定义；`deploy.js` 仍在生成这些类名，`deploy.css:899` 的注释也仍写着「复用 run.css 全局定义」。

实测该元素当前 `padding: 0`、无背景、无下边框、`cursor: auto`——分组头退化成一行裸文字（形如 `•亳州药都项目 1 个项目`），且**折叠触发区失去 pointer 光标提示**，可点性不可见。此项已登记在主执行计划 Phase 6「部署面板」小节，本阶段修复。

**D2（高）单项目分组卡片只占三分之一宽度。** `deploy-group-grid` 是固定三列 `repeat(3, minmax(0, 1fr))`，单项目分组右侧空掉两列。10 个项目分散在 6 个分组，1665×1184 首屏只能看到 5 张卡，纵向浪费严重。本地运行页此前用 `auto-fit` 折叠空轨道解决过同一问题（见 run/decision 第 3 节 P6），部署页未同步。

**D3（中）分组头信息密度低于本地运行页。** 缺少「运行中 N」这类状态摘要，也没有分组级的构建/部署汇总；数量文案为「N 个项目」而非更紧凑的徽标。

**D4（中）项目卡固定 230px 高。** `#page-deploy .project-card` 写死 `height/min-height/max-height: 230px`。未配置服务器的项目内容更少，卡内出现明显空白（取证截图中「茅台调度中心」「茅台应用门户」可见）。

**D5（低）emoji 图标。** 卡片与按钮使用 📦 📄 🔨 🚀 🗑 等 emoji，跨系统渲染不一致且自带彩色。本地运行页与双因验证页已统一改为描边 SVG。

### 3.2 未发现问题的部分

- 服务器管理子页：7 台服务器表格布局正常，列宽、mono 字体与操作按钮均无异常。
- 部署历史子页：122 条记录、类型/模块/服务器/状态列显示正常，筛选 chip 与批量选择入口正常。
- 三档尺寸无横向溢出，窄窗口下卡片正确降为单列。

## 4. 待 PG1 研究的高风险链路

以下必须在 PG1 阶段完成代码级梳理，PG2 之前不得提方案：

- SSH 连接与凭据存储：`/api/servers/*`、FileZilla 导入路径。
- 构建与部署任务生命周期：`/api/deploy/build`、`/api/deploy/start`，与 LogViewer 的进度、步骤、结果回调时序。
- 部署历史清理语义：`/api/history/cleanup` 的批量删除与筛选条件组合。
- 项目扫描与浏览：`/api/projects/available`、`/api/projects/browse`、`/api/projects/batch`。
- 11 处弹窗的状态归属，特别是 `modalState` 与 `activeCtx` 这两个跨弹窗共享变量。
- 与本地运行页共享的 `groupName` / `runGroupOrder` 语义（分组排序与重命名会双向影响两页）。
