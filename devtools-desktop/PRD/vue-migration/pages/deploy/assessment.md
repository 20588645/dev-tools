# 部署面板页面迁移评估

> 状态：**PG0～PG1 已完成（2026-08-06）**，PG2 方案待产出
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

## 4. PG1 代码研究（2026-08-06）

### 4.1 最重要的结构事实：任务状态不在本页

`deploy.js` 只负责渲染与表单收集，**部署任务的核心状态与 WebSocket 处理全部在 `app.js`**：

| 全局 | 定义位置 | 职责 |
| --- | --- | --- |
| `activeTask` | `app.js:314` | `{ id, projectName, isRunning }`，当前执行中的任务 |
| `currentDeployId` | `app.js:11` | WS 消息的归属判据 |
| `busyProjects` | `app.js:14` | 防重复部署锁，`setBusy` / `clearBusy` 维护 |
| `currentProject` | `app.js:8` | 弹窗操作的目标项目 |
| `servers` | `app.js:5` | 服务器列表 |
| `logViewerStepCount` | `app.js` | 步骤总数，供 phase → 步骤索引映射 |

`WS.on('log' / 'progress' / 'status')` 三个处理器也都在 `app.js:700～770`。**迁移时不能只搬 `deploy.js`**，必须同时把这套任务状态机搬进 Vue store，否则会出现「Vue 页面 + legacy 状态机」的割裂。

### 4.2 构建与部署任务生命周期

发起端（`startBuildOnly` / `startDeploy`）时序固定为：

1. 校验（多模块必选模块；部署必选服务器，多服务器需二次确认）
2. `saveLastSelected` 落 localStorage
3. Node 版本若有变更，先 `PUT /api/projects/:name` 落库（`.catch(() => {})` 静默失败）
4. `withButtonBusy` 锁按钮防连点
5. `setBusy(projectName)` → `activeTask = { id: null, isRunning: true }` → 关弹窗 → 开 LogViewer
6. `POST /api/deploy/build` 或 `/start`，成功后回填 `currentDeployId` 与 `activeTask.id`

**关键边界（迁移必须保留）**：请求失败时后端不会回 WS 完成事件，必须本地 `clearBusy` + 重置 `activeTask`，否则卡片永久卡在 ⏳ 需重启软件。代码里两处都有明确注释。

**`activeTask.id` 为 null 的竞态窗口**：从第 5 步到第 6 步之间，WS 消息可能先于 HTTP 响应到达。`app.js` 用 `!(activeTask && !currentDeployId)` 这个条件兜住——即「有活跃任务但还没拿到 id」时接受消息并就地补写 id。迁移时这个竞态必须显式建模，不能想当然认为 HTTP 先返回。

**步骤映射**：构建 2 步（拉取代码、构建中），部署 5 步（预检、拉取代码、构建中、上传中、完成）。`app.js` 按 `stepCount <= 2` / `> 3` 分支把 phase 映射到步骤索引，是硬编码的对应关系。

**后台完成**：`status.phase === 'done'` 时若 LogViewer 已最小化，会 `reopen()` 并发 toast 与桌面通知，最后 `loadProjects()` 刷新卡片。

### 4.3 凭据存储（已确认安全契约）

- 前端 `saveServer` 用 `/^\*+$/` 判断密码是否为掩码值，是掩码则**不提交** `password` 字段，避免把 `******` 覆盖真实密码。
- 后端 `sidecar/routes/servers.js` 落库前 `encrypt(password)`，所有响应（列表、单条、FileZilla 导入）统一回 `'******'`。
- `sidecar/routes/deploy.js:63` 在真正建立 SFTP 连接时才 `decrypt`。

迁移必须保持这三点，尤其是前端的掩码判断——去掉会导致用户编辑服务器时静默清空密码。

### 4.4 分组与本地运行页共享（双向影响）

| 存储 | 作用域 | 是否共享 |
| --- | --- | --- |
| `p.groupName`（项目字段） | 后端持久化 | **共享**，重命名分组两页同步 |
| `runGroupOrder`（localStorage） | 分组排序 | **共享**，上移/下移两页同步 |
| `deployCollapsedGroups` | 折叠态 | 本页独立（本地运行页用 `runCollapsedGroups`） |

`renameDeployGroup` 会逐个 `PUT /api/projects/:name` 更新受影响项目，并同步迁移折叠态与排序条目。这是刻意设计（见代码注释），迁移后必须保持——两页共用同一套分组语义。

### 4.5 弹窗状态归属

`modalState` 只有 `build` / `deploy` 两个 context，各自持 `checkedModules: Set` 与 `moduleFilter`；`activeCtx` 记录当前哪个弹窗在用，供 `renderModules` 等无参调用时取默认值。

`initModalState(ctx, name)` 是两个弹窗的共同入口：设 `currentProject` → 清空该 ctx 状态 → 写 DOM 标题/副标题 → 按单体/多模块切换视图 → 多模块时从 `last_<project>` 恢复上次选择 → 填充 Node 版本下拉。

模块收藏与上次选择都存 localStorage（`fav_<project>` / `last_<project>`），与本地运行页的 `favoriteRunModules`（后端字段）**不是同一套**，迁移时不要误合并。

### 4.6 API 面（24 个端点）

项目：`GET /api/projects`、`GET /available`、`GET /browse?dir=`、`POST /batch`、`PUT /:name`、`DELETE /:name`、`GET /:name/git-log`、`GET /node-versions/list`

服务器：`GET /api/servers`、`POST`、`PUT /:id`、`DELETE /:id`、`POST /:id/test`、`POST /:id/quick-test`、`POST /:id/browse`、`GET /filezilla`、`POST /filezilla/parse`、`POST /filezilla/import`

部署：`POST /api/deploy/build`、`POST /api/deploy/start`、`GET /api/deploy/last/:name`

历史：`GET /api/history`、`GET /api/history/:id`、`POST /api/history/cleanup`

### 4.7 迁移风险点汇总

- **任务状态机跨文件**：必须与 `app.js` 一同迁移，不可只搬本页（4.1）。
- **WS 与 HTTP 竞态**：`activeTask.id` 为 null 的窗口必须显式建模（4.2）。
- **失败路径解锁**：请求失败必须本地 `clearBusy`，否则卡片永久卡死（4.2）。
- **密码掩码判断**：删掉会静默清空用户密码（4.3）。
- **分组双向共享**：`groupName` 与 `runGroupOrder` 改动会影响本地运行页（4.4）。
- **两套模块偏好**：localStorage 的 `fav_*` 与后端 `favoriteRunModules` 不可混淆（4.5）。
- **87 个全局函数 + 22 个内联 `onclick`**：`index.html` 中的 `onclick` 需与 JS 同批替换，漏一个就是运行时报错。
