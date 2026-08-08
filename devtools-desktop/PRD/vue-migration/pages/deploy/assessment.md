# 部署面板页面迁移评估

> 状态：整页 **PG0～PG3 已完成**（PG3 结论见 decision.md 第 6 节）；服务器管理子页 PG0 补充取证已完成（2026-08-07）
> 关联决策：[decision.md](./decision.md)
> 产出日期：2026-08-06，2026-08-07 补充第 3.3 节

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

## 3.3 服务器管理子页 PG0 补充取证（2026-08-07）

第 3 节整页取证在正式库只读观察，未点开弹窗。本轮针对服务器管理子页在**测试库**（`13900` + `data-test`）补齐弹窗、极端数据与失败态，覆盖 1665×1184 与 900×600、亮暗主题。测试库 3 台服务器。

| 观测项 | 结果 |
| --- | --- |
| 表头/数据行列宽 | 两容器 grid 完全对齐（1665：`373/339/72/54/458/100`；900：`130/130/72/54/180/100`） |
| 行高 | 统一 40px，表头 40px |
| 横向溢出 | 1665 与 900 均无；长文本行 `scrollWidth == clientWidth` |
| 窄窗口降级 | `@media (max-width: 1080px)` 隐藏第 4 列，表头与数据行**同步隐藏**「端口」，对齐不破 |
| 极端长文本 | 名称/Host/用户/路径四列均正确 ellipsis 截断，行高不涨 |
| 空态 | `暂无服务器，点击"添加服务器"按钮`，表头一并清空 |
| 失败态 | 首次加载失败给 `⚠️ 加载服务器失败 + 重试` 按钮，表头清空；已有数据时仅 toast 保留旧列表 |
| 服务器表单弹窗 | 亮暗主题均正常，字段与间距无异常 |

### 3.3.1 新增确认缺陷

**D6（高）FileZilla 导入弹窗在存在默认配置时完全打不开。** 实测点击「从 FileZilla 导入」后 `filezillaModal` 始终没有 `active` 类，页面抛 `PAGEERROR str.replace is not a function`。

根因：`escapeHtml`（`src/js/app.js:1129`）直接调用 `str.replace`，对非字符串入参抛异常；`deploy.js:1285` 的 `escapeHtml(s.port)` 与 `1281` 的 `escapeAttr(s.port)` 传入的 `s.port` 是数字——后端 `sidecar/routes/servers.js:98` 用 `parseInt(getTag('Port'), 10) || 22` 明确回数字。异常在 `renderFzServers()` 内抛出，`showFileZillaImport()` 后一行的 `classList.add('active')` 永不执行，弹窗静默不出现。

副证：`fzPath` 文本已被正确写入（`默认配置: ~/.config/filezilla/sitemanager.xml`），说明 HTTP 请求成功，崩点确实在渲染阶段而非取数阶段。空配置路径（`fzServers.length === 0`）走 early return 不触碰 `s.port`，因此**只在解析出至少一台 SFTP 服务器时复现**，这也是此前取证与整页 PG0「服务器管理子页未发现问题」判断漏掉它的原因。

服务器表格自身用裸插值 `${s.port}` 不经过 `escapeHtml`，未受影响。`deploy.js` 内其余 `escapeHtml`/`escapeAttr` 调用点入参均为字符串字段，经检索无第二处同类型错误。

**D7（低）认证方式下拉只有一个选项。** `frontend/index.html:646` 的 `sf_authType` 仅含 `<option value="password">密码</option>`，实测下拉可选值只有 `password`。后端 `authType` 字段虽可存任意值，但无密钥认证实现。这是一个"看起来可选、实际无选择"的控件。

### 3.3.2 与本子页无关的既有噪声

控制台另有 `PAGEERROR e.defineSimpleMode is not a function`，来自 CodeMirror vendor 的 simple-mode 插件加载顺序，全页级既有问题，不在本子页范围内处理。

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

## 5. 服务器管理子页 PG1 代码研究（2026-08-07）

### 5.1 子页结构与 DOM 契约

DOM 只有三块：工具栏两个按钮（`showFileZillaImport()` / `showServerForm()`）、固定表头容器 `#serverHeader`、独立滚动列表 `#serverList`（`frontend/index.html:97-98`）。

表头与数据行**分属两个容器但共用同一套 `.server-row` grid 列宽**，列宽唯一 setter 是 `deploy.css:343` 的 `#page-deploy .server-row`（6 列）。这是刻意设计（表头不随数据滚动），迁移到 `BaseDataTable` 时需确认该组件自身的固定表头方案能覆盖同一语义，不要一边用组件一边留手写 grid。

`deploy.css:306` 在 `max-width: 1080px` 隐藏第 4 列，因两容器共用列定义，表头与数据同步隐藏「端口」——迁移后窄窗口的列隐藏行为需保留。

### 5.2 状态与生命周期

本子页状态极少，只有两个模块级变量：

| 变量 | 位置 | 职责 |
| --- | --- | --- |
| `servers` | `app.js:5`（全局） | 服务器列表，`loadServers()` 写入，构建/部署弹窗与项目配置弹窗共读 |
| `sfDeployPaths` | `deploy.js:799` | 服务器表单的发布目录 tag 数组，`showServerForm` 重置 |
| `fzServers` / `checkedFzServers` / `currentFzXmlContent` | `deploy.js:1218-1220` | FileZilla 弹窗态 |

`servers` 是**跨子页共享**的：`renderConfigServers`（项目配置弹窗）与部署弹窗的服务器多选都读它，所以 store 化时应放 deploy 级共享 store，不能塞进服务器子页局部 composable。

`sfDeployPaths` 的 tag 输入用了一个**文档级 keydown 监听**（`deploy.js:912`），靠 `document.activeElement !== input` 早退。迁移到 Vue 后应改成元素级 `@keydown`，否则会留下永不解绑的全局监听。tag 交互含三条隐含规则：路径自动补首尾 `/`、重复路径给 1.2s placeholder 提示而非弹窗、输入框为空时 Backspace 弹出最后一个 tag。双击 tag 文本进入原地编辑（`editPathTag` 用 `replaceWith` 换成 input，blur/Enter 提交、Escape 放弃）。

### 5.3 已有 Service 层覆盖情况（重要）

`deploy-service.ts` 在项目总览子页阶段已把服务器管理的**全部 9 个端点**都建好了：`getServers` / `createServer` / `updateServer` / `deleteServer` / `testServer` / `quickTestServer` / `browseRemoteDir` / `getFileZillaServers` / `parseFileZillaXml` / `importFileZillaServers`，密码掩码契约也已固化为 `isMaskedPassword` + `buildServerPayload`（`deploy-service.ts:67,77`）。本子页 PG4 **不需要新建 service**，但需先修下面三个契约缺陷。

### 5.4 Service 层与后端契约不一致（未被使用因而未暴露）

这三处都在 FileZilla 相关函数上，目前 Vue 侧没有消费方，所以线上不可见，但按现状接入必然失败：

| 编号 | 位置 | 问题 |
| --- | --- | --- |
| S1 | `deploy-service.ts:213` | 发 `{ xml }`，后端 `servers.js:143` 读 `req.body.xmlContent`，必然 400「缺少 XML 内容」 |
| S2 | `deploy-service.ts:207,213` | 按裸数组解析响应，但两个端点实际返回 `{ path, servers }` 对象，`rows ?? []` 恒为空数组 |
| S3 | `deploy-service.ts:188` | `FileZillaServer` 类型缺 `exists` 字段，而「已导入 / 将删除 / 待导入」三态语义完全依赖它；同时丢掉了 `GET /filezilla` 的 `path`（弹窗副标题要显示配置文件路径） |

`deploy-service.test.ts` 对 filezilla 三个函数**零覆盖**，这是缺陷能潜伏至今的原因。PG4 修这三处时应一并补测试。

### 5.5 副作用与破坏性操作

| 操作 | 副作用 | 迁移注意 |
| --- | --- | --- |
| `testServer` | 开 LogViewer + `POST /:id/test`，后端建真实 SFTP 连接并走 WS 推日志 | 需 `attachTaskId`，失败时 `appendLog` 而非 toast |
| `deleteServer` | `showConfirm(danger)` 后 `DELETE /:id` | 无级联检查：删掉被项目引用的服务器不会告警，属既有行为 |
| `saveServer` | 掩码密码不提交（`/^\*+$/`） | 见 4.3，删掉会静默清空密码 |
| `importFileZillaServers` | 按 host+port 去重，已存在则 skip 不覆盖 | 弹窗里「将删除」文案只是意图提示，后端 import **不执行删除**，语义不对齐属既有问题，本轮不改 |

`testServer` 与 `quickTestServer` 都建真实 SSH 连接，**自动化不得在真实数据上触发**，PG4 与 PG5 的连接测试必须由用户在真机点。

### 5.6 legacy 待删清单（PG5 用）

JS：`loadServers` / `renderServers` / `showServerForm` / `renderPathTags` / `editPathTag` / `removePathTag` / `editServer` / `saveServer` / `deleteServer` / `testServer` / `showFileZillaImport` / `loadFzFromFile` / `renderFzServers` / `toggleFzServer` / `toggleAllFz` / `importFileZillaServers`，以及 `deploy.js:912` 的文档级 keydown 监听与 `sfDeployPaths`。

CSS：`.server-row` / `.server-head` / `.server-card` / `.server-name` / `.server-host` / `.server-actions` / `.server-list` / `.server-header-fixed` / `.path-tag` / `.tag-*`，分布在 `deploy.css`、`components.css`、`overrides.css` 三处；`.server-host` 与 `.server-row` 被历史表规则共用（`deploy.css:330`、`overrides.css:338`），删除时必须逐条区分独占与混合选择器，沿用项目总览子页那次的处理方式。

HTML：`frontend/index.html:88-99` 子页容器（含工具栏两按钮 + `#serverHeader` + `#serverList`）、`631-663` 服务器表单弹窗、`773-803` FileZilla 弹窗，静态内联 `onclick` 共 12 个（另有 `renderServers` / `renderPathTags` / `renderFzServers` 动态生成的 6 个）。

注意本子页工具栏用的是 `page-sticky-header` + `page-header`，与全局约定的 `.page-fixed-header` 吸附组件不是同一个类名，PG4 接 `PageTop` 公共组件时要按共享清单核对，不要照搬 legacy 类名。

## 6. 部署历史子页 PG0 运行态取证（2026-08-07）

测试库（`13900` + `data-test`）4 条记录（3 成功 / 1 失败，3 deploy / 1 build-only）。覆盖 1665×1184、1280×800、900×600 三档尺寸 × 亮暗主题，以及筛选、批量选择、清理弹窗、日志回放、空态、失败态与极端数据。

| 观测项 | 结果 |
| --- | --- |
| 表头/数据行列宽 | 三档尺寸下两容器 grid 完全一致（如 1665：`94/412.8/78/336.4/305.8/88/72`），对齐无破 |
| 行高 | 表头 32px、数据行 34px，各尺寸稳定 |
| 横向溢出 | 三档均无 `document` 级溢出 |
| 窄窗口降级 | 900 宽下隐藏「服务器」列，表头与数据行同步隐藏 |
| 统计条 | `共 4 条记录 · ✅ 3 成功 · ❌ 1 失败`，筛选后追加「当前筛选 N 条」 |
| 类型/状态筛选 | 单选与叠加均正确；无匹配时给「暂无匹配的部署记录」且表头清空 |
| 批量选择 | 开启后列宽整体右移一列（多 32px 复选列）、表头同步加 `with-check`；计数、行高亮 `row-selected`、删除键禁用/解禁、取消后复原均正常 |
| 清理弹窗 | 默认保留 30 天 / 每项目 5 条，文案完整 |
| 日志回放 | 正常展示历史日志、100% 进度与「部署完成！耗时 1m 23s」，关闭键为「关闭」而非「最小化」（`running: false` 生效） |
| 空态 | `暂无匹配的部署记录`，表头清空，统计条归零 |
| 失败态 | `⚠️ 加载历史失败 + 重试`，表头清空；已有数据时仅 toast 保留旧表 |

### 6.1 已确认缺陷

**H1（中）窄窗口下模块标签被压成不可辨识的碎片。** `deploy.css:427` 的 `.history-modules` 是 `flex-wrap: nowrap` + `overflow: hidden`，子项 `.module-tag` 为 `flex: 0 1 auto`（可收缩）。模块数一多，各标签被等比压缩：实测 7 个模块在 1665 宽下各约 44px（文字 ellipsis 但可读首词），在 900 宽下**全部压到 17px，只剩一个字符**（截图 `m.` `m.` …），既读不出模块名也看不出总数。

注意 `scrollWidth == clientWidth`，所以容器层面并未溢出——是子项被压缩而非被裁切，靠溢出检测发现不了。本地运行页与项目总览子页已统一为「前 3 个 + `+N`」，本页未同步（对应整页 decision 的 O4，此前判为不处理，但那是基于 1665 宽的观察）。

**H2（中）极端长文本下操作列被挤出可视区。** 单条记录含超长项目名 + 三个服务器 + 7 模块时，900 宽下 `.history-row` 出现 `scrollWidth > clientWidth`（行内溢出），操作列的两个按钮被推出行外不可点击。服务器管理子页同尺寸同类数据实测 `rowOverflow: false`，故这是本页独有。

**H3（低）操作按钮用字符而非图标且缺无障碍名。** `deploy.js:907-908` 用 `⌗`（查看日志）与 `⌫`（删除）两个字符，语义不直观；实测两个按钮**只有 `title`、没有 `aria-label`**，屏幕阅读器读不出用途。项目总览与服务器管理子页已统一为描边 SVG + `aria-label`。

**H4（低）批量选择的复选框在未勾选态几乎不可见。** `.ios-check` 未选中时为 `background: transparent` + `1.5px var(--border-strong)` 细边框，在浅色表格底上对比度过低（取证截图中需放大才能确认存在）。功能无碍，属可发现性问题。

### 6.2 未发现问题的部分

- 三档尺寸的表头/数据行列宽对齐、行高、窄窗口列隐藏均正常。
- 筛选、批量选择、清理弹窗、日志回放、空态、失败态六条链路功能均正确。
- 日志回放全程无控制台错误（仅既有 `defineSimpleMode` 噪声）。

### 6.3 状态值命名差异（迁移必须注意，非缺陷）

后端一律写 `status: 'fail'`（`sidecar/routes/deploy.js` 六处），legacy 前端筛选 chip 的 `data-value` 也用 `fail`，二者一致。

但 `deploy-service.ts` 的 `normalizeHistoryItem` / `getLastDeploy` 把非 `success` 一律折叠为内部值 `'error'`（`DeployRecordStatus = 'success' | 'error'`）。折叠方向安全（`'fail'` 会正确落入失败态），但**迁移时筛选必须按内部 `'error'` 比对，照搬 legacy 的 `'fail'` 会导致失败筛选永远为空**。

## 7. 部署历史子页 PG1 代码研究（2026-08-07）

### 7.1 子页结构与 DOM 契约

DOM 四块（`frontend/index.html:93-115`）：工具栏三个按钮（选择 / 批量删除 / 整理）、类型与状态两组 `.chip` 筛选、统计条 `#historyStats`、固定表头 `#historyHeader` 与独立滚动表体 `#historyTable`。与服务器管理子页同构——**表头与数据行分属两个容器但共用 `.history-row` grid 列宽**，列宽权威在 `deploy.css` 的 `.history-row` 与 `.history-row.with-check`（批量态多一列 32px 复选框）。

`deploy.css:306` 在 `max-width: 1080px` 隐藏 `.h-server`，因两容器共用列定义故同步生效，迁移后需保留。

静态内联 `onclick` 共 12 个（子页 9 + 清理弹窗 3），另有 `renderHistory` 动态生成的 3 个（复选框 onchange、查看日志、删除）。

### 7.2 状态与生命周期

模块级状态四个，全部只服务本子页，**不与其它子页共享**（对比服务器子页的 `servers` 是跨子页共享的）：

| 变量 | 职责 |
| --- | --- |
| `historyData` | 列表数据，`loadHistory` 写入 |
| `batchSelectMode` | 批量选择模式开关 |
| `selectedHistoryIds: Set` | 已选记录 id |
| `chipFilters` | `{ segType, segStatus }` 两组筛选值 |

因此可整体收进子页局部 composable，无需进 store。

**每次交互都全量重渲**：`setChipFilter` / `toggleHistorySelect` / `toggleBatchSelect` / 删除后都调 `renderHistory()` 重建整张表。其中 `toggleHistorySelect` 每勾选一次就重渲全表——Vue 侧改成响应式后天然消除。

`switchSubTab` 每次切到本子页都调 `loadHistory()` 全量重取（无 silent 刷新概念）。

### 7.3 已有 Service 层覆盖情况

`deploy-service.ts` 已建好全部 5 个端点：`getHistory` / `getHistoryLog` / `deleteHistoryItem` / `deleteHistoryItems` / `cleanupHistory`，`normalizeHistoryItem` 亦已就位。PG4 **不需要新建 service**，但需先修下面两处缺陷。

### 7.4 新发现缺陷（Service 层与后端）

**H5（高）`getHistoryLog` 恒返回空数组。** `deploy-service.ts:363` 读 `row.lines`，回退读 `row.log`；而后端 `sidecar/routes/history.js:44` 写的字段是 **`record.logs`**。两个候选字段都不存在，`lines` 恒为 `[]`。

实证（测试库 `b8seed-h1` 造一条含 2 行的日志文件）：后端返回 `logs` 2 条、`logs[0] = {time, type, text}` 结构正确，而 `lines` / `log` 字段均不存在——`getHistoryLog` 必然返回空数组。与服务器子页的 S2 同类（都是响应字段名与后端不符），同样因 Vue 侧尚无消费方而未暴露；`deploy-service.test.ts` 对 `getHistoryLog` 亦零覆盖。

**H6（中）测试模式下历史日志读写落到正式库目录。** `history.js:28` 与 `:56` 把日志路径硬编码为 `path.join(__dirname, '../data/logs/...')`，而 `sidecar/index.js:120` 已按 `IS_TEST` 把 `dataDir` 切到 `data-test`。实测测试库（`13900`）下把日志写进 `data-test/logs/` 读不到，写进 `data/logs/` 才读到——即**测试模式在读写正式库的日志文件**，`deletePhysicalLogs` 同理会删正式库日志。

这是测试隔离的破口（违反「13900 测试隔离」纪律），且删除操作会真实影响正式数据。属后端缺陷，不在本子页迁移范围内，建议单列一个修复项。

### 7.5 副作用与破坏性操作

| 操作 | 副作用 | 迁移注意 |
| --- | --- | --- |
| `deleteSingleHistory` | `showConfirm(danger)` → `DELETE /:id` → 后端连带物理删日志文件 | 前端本地过滤 `historyData` 而非重新拉取，需保持 |
| `batchDeleteHistory` | 二次确认「不可撤销」→ `DELETE /` 带 `ids` → 连带删物理日志 | 不可撤销，确认文案需保留条数 |
| `executeCleanup` | `POST /cleanup` 按「保留天数 + 每项目条数」批量删记录与物理日志 | 后端已对入参做 clamp（1～3650 / 1～1000），前端 `parseInt \|\| 30` 的兜底可保留 |
| `viewLog` | 写 `currentDeployId` 并开 LogViewer 回放 | `running: false` 让关闭键是「关闭」而非「最小化」，必须保留；迁移后 `currentDeployId` 改由 deploy-task store 承载 |

三个删除动作都会**物理删除日志文件、不可恢复**，PG4 与 PG5 的删除验证不得在正式库上执行。

### 7.6 对 legacy 全局的依赖

`API` 5 次、`showAlert` 4、`showToast` 4、`escapeHtml` 3、`escapeOnclickArg` 3、`logViewer` 3、`showConfirm` 2，以及 `openLogViewer` / `renderState` / `withButtonBusy` / `currentDeployId` / `closeModal` 各 1。迁移方向与前两个子页一致（Service / `useNotificationStore` / `ConfirmDialog` / 公共 LogViewer / Vue 插值自带转义）。

### 7.7 legacy 待删清单（PG5 用）

JS：`loadHistory` / `setChipFilter` / `getSegValue` / `renderHistory` / `toggleBatchSelect` / `toggleHistorySelect` / `updateBatchCount` / `deleteSingleHistory` / `batchDeleteHistory` / `showCleanupDialog` / `executeCleanup` / `viewLog` 共 12 个函数，及 `historyData` / `batchSelectMode` / `selectedHistoryIds` / `chipFilters` 四个模块变量。

CSS：`.history-row`（含 `.with-check` / `.history-header` / `.row-selected`）、`.history-table`、`.history-header-fixed`、`.history-stats`、`.h-cell` 系列（`h-time` / `h-project` / `h-type` / `h-modules` / `h-server` / `h-status` / `h-actions` / `h-check`）、`.history-modules`、`.module-tag`、`.type-pill`、`.status-dot-mini`、`.deploy-stat-num`、`.ios-check`、`.deploy-empty-state`。分布在 `deploy.css`、`components.css`、`overrides.css`、`legacy-runtime.css`——**本子页是 deploy 页最后一个，这批删完 `deploy.css` 应可整体删除**，届时 Stylelint 重复选择器基线里 `deploy.css` 与 `overrides.css` 的登记项应一并归零（见 decision 8.6 的预判）。

HTML：`frontend/index.html:93-115` 子页容器、清理弹窗 `#cleanupModal`。
