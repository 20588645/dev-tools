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

## 8. 构建/部署弹窗（第 6 步）PG0 运行态取证（2026-08-08）

测试库（`13900`）：3 个项目、3 台服务器、`b8seed-portal` 含 6 个模块、扫描目录下 27 个可用项目。覆盖 1665×1184 与 900×600 × 亮暗主题。**只读取证**——未点「开始构建」「构建并部署」，未删项目。

本步范围是 deploy 页最后一块：`deploy.js` 剩余 **48 个函数 / 854 行**，六个弹窗（`edBrowserModal` 属文件编辑页，不在本步）。

| 弹窗 | 尺寸(默认) | 原生控件 | 内联事件 | 取证结论 |
| --- | --- | --- | ---: | --- |
| `buildModal` | 780×410 | 1 select + 1 input | 7 | 模块 6 个、Node 版本 8 项，标题/副标题正确 |
| `deployModal` | 780×550 | 2 select + 1 input | 9 | 模块 6、服务器 3、发布目录 2 项 |
| `projectConfigModal` | 500×462 | 1 select + 1 input | 3 | 服务器 3、Node 8、别名回填正确 |
| `addProjectModal` | 720×631 | 2 input | 12 | 自动扫描 27 项；手动浏览目录/项目区分正确 |
| `remoteBrowserModal` | — | 0 | 3 | 远程目录浏览，依赖 SSH 未在取证中触发 |
| `projectIntroModal` | — | 0 | 2 | 全局介绍弹窗，非本页专属 |

三档尺寸下均无 `document` 级横向溢出；亮暗主题一致；全程零控制台错误（仅既有 `defineSimpleMode` 与测试库空数据 404 噪声）。

### 8.1 已确认缺陷

**M1（中）900 宽下部署弹窗几乎占满视口且底部内容被截断。** 弹窗宽度固定 780px，在 900 宽窗口只余 60px 边距；高度实测 492px 而视口 600px，`modal-body` 出现滚动（`bodyScrolls: true`）——「发布目录」一行被底部按钮栏压住，需滚动才能看到，但**没有任何可滚动提示**。默认尺寸（1665×1184）下高 550px 完整展示，不复现。

对比已迁子页的 `BaseDialog` 用 `var(--component-dialog-width)` + `bodyMaxHeight` 由内容区自身滚动并保留头尾吸附，是现成解法。

**M2（低）弹窗区仍有 24 处 emoji。** `🚀 构建并部署`、`🔨 开始构建`、`📂 浏览`、`⚙ 项目默认配置`、`🔗 测试连接` 等。三个已迁子页均已统一为描边 SVG（D5 / H3 同源问题），本步是最后一处。

**M3（低）六个弹窗共 36 处内联事件与 4 个原生 select / 5 个原生 input。** 组件架构门禁对**新增** Vue 代码是零容忍（`native-control`），迁移时须全部替换为 `BaseSelect` / `BaseInput` / `BaseCheckbox`。`addProjectModal` 的 12 处最集中。

### 8.2 未发现问题的部分

- 三种空态文案**已正确区分**，非共用一句误导文案：无扫描结果给「未在扫描目录下发现前端项目，可切到『手动浏览』选择」、搜索无匹配给「没有匹配的项目」、全部已添加给「所有项目已添加」。
- 无服务器时部署弹窗给「请先添加服务器」，不是空白。
- 手动浏览的目录/项目区分、空目录标灰、「前端项目」标记均正确。
- 模块网格在 900 宽下最小项宽 181px，未出现历史子页 H1 那种被压成单字符的情况。

### 8.3 取证方法上的两处修正（供后续参考）

- `getByRole('button', { name: '部署' })` 会**先匹配到侧边栏的「部署面板」**（第 3 个才是卡片按钮），导致弹窗未打开却无报错。须限定 `[data-test="deploy-dashboard"] button` + `hasText: /^部署$/`。
- 添加项目弹窗的真实容器是 `#availableProjectGrid`、条目类是 `.module-item`（不是 `#availableList .available-item`）；手动浏览是 `#addBrowseBreadcrumb` / `#addBrowseList`。选择器写错会得到「0 项」的假空态结论。

## 9. 构建/部署弹窗（第 6 步）PG1 代码研究（2026-08-08）

### 9.1 最重要的发现：当前版本已存在忙态双写缺陷

**M4（高）从弹窗发起构建/部署时，项目卡片不显示忙态。**

`deploy.js` 的 `startBuildOnly` / `startDeploy` 只维护 legacy 三件套（`setBusy` + `activeTask` + `currentDeployId`），**从不调用 `deploy-task` store 的 `begin()`**；而项目总览子页的卡片忙态读的是 store（`DeployDashboardView.vue:160,176` 的 `task.isBusy(project.name)`）。

实测（拦截 `/api/deploy/build` 只观察前端状态流转）：

| 观测项 | 结果 |
| --- | --- |
| legacy `activeTask` | `{id: 'build-probe-1', projectName: 'b8seed-portal', isRunning: true}` ✅ |
| legacy `busyProjects.size` | `1` ✅ |
| 卡片是否显示「查看进度」 | **`false`** ❌ |
| LogViewer 是否打开 | `true` ✅ |

即：日志弹窗正常、legacy 状态正常，但**卡片忙态从项目总览子页迁移后就一直不亮**。这与服务器管理子页首轮验收发现的 T2 同源（都是「legacy 发起任务、未登记 store、导致 store 侧消费方失效」），只是那次症状是日志不进弹窗，这次是忙态不显示。

`useDeployRealtime` 的 `acceptsMessage` 在 `active` 为 null 时一律拒收，因此 WS 的 `progress` / `status` 也进不了 store——卡片在整个构建期间都不会有忙态，直到用户手动刷新页面。

### 9.2 状态归属：store 已完整覆盖，legacy 仍在并行维护

`deploy-task` store 已具备全部所需语义：`begin` / `attachTaskId` / `adoptTaskId` / `finish` / `abandon` / `setBusy` / `clearBusy` / `reset`。`app.js` 侧的 `activeTask`(15+6 处引用)、`currentDeployId`(9+2)、`busyProjects`(3) 与之**语义重复**，是迁移未完成留下的并行状态。

`logViewerStepCount`（`app.js:1048`，3 处）服务 phase → 步骤索引映射，Vue 侧已由 `useDeployRealtime.stepIndexOf` 承担同一职责。

`currentProject`（`deploy.js` 30 处）是弹窗操作的目标项目，本步迁移后应收进弹窗组件自身的 props/state。

### 9.3 弹窗状态与偏好

`modalState`（`deploy.js:286`）只有 `build` / `deploy` 两个 context，各持 `checkedModules: Set` 与 `moduleFilter`；`activeCtx` 记录当前哪个弹窗在用。`initModalState(ctx, name)` 是共同入口。

localStorage 偏好两套，**迁移时不可合并**（延续 4.5 节的判断）：
- `fav_<project>` / `last_<project>` — 弹窗内的模块收藏与上次选择
- 后端 `favoriteRunModules` — 本地运行页的收藏，独立字段

其余局部状态：`configProjectName` / `configCheckedServers`（项目配置弹窗）、`currentAddMode` / `checkedBrowseProjects`（添加项目）、`checkedServers`（部署弹窗服务器多选）、`browserCurrentDir`（远程浏览）。均只服务单个弹窗，可随组件私有化。

### 9.4 对 legacy 全局的依赖（迁移须逐项替换）

`currentProject` 30、`escapeHtml` 19、`API` 15、`showAlert` 12、`escapeAttr` 10、`escapeOnclickArg` 10、`withButtonBusy` 7、`activeTask` 6、`closeModal` 5、`updateLogModalCloseBtn` 5、`showLogModal` 3、`showToast`/`showConfirm`/`appendLog`/`setBusy`/`clearBusy`/`currentDeployId` 各 2、`openLogViewer`/`logViewer` 各 1。

迁移方向与前三个子页一致（Service / `useNotificationStore` / `ConfirmDialog` / 公共 LogViewer / Vue 插值自带转义 / `deploy-task` store）。**三个 escape 系列共 39 处调用在 Vue 插值下大部分自然消失**——这也是本步能显著减少代码量的原因。

### 9.5 Service 层覆盖情况

`deploy-service.ts` 已建好本步所需端点：`startBuild` / `startDeploy` / `getLastDeploy` / `browseRemoteDir` / `quickTestServer` / `getGitLog` / `getAvailableProjects` / `browseProjects` / `addProjects` / `removeProject`，`project-service` 提供 `updateProject`。**无需新建 service**，但 `getGitLog` 的 `timestamp` 已在上一轮随 `normalizeTimestamp` 修复。

### 9.6 破坏性操作与必须保留的契约

| 操作 | 风险 | 迁移注意 |
| --- | --- | --- |
| `startDeploy` | 真实部署到生产服务器 | 多服务器需二次确认；失败必须 `clearBusy` + 重置任务态，否则卡片永久卡死 |
| `startBuildOnly` | 真实构建 | 同上 |
| `removeProject` | 移除项目（不删文件） | 已由项目总览子页的 Vue 实现承担，本步不重复 |
| Node 版本变更 | 即时 `PUT /api/projects/:name` 落库、失败静默 | 见 decision 第 1 节，属有意设计 |
| `quickTestServers` | 建真实 SSH 连接 | 自动化不得在真实数据上触发 |

**WS 与 HTTP 竞态**：`activeTask.id` 为 null 的窗口必须显式建模，store 的 `adoptTaskId` 已实现，迁移时改用它而非重新发明。

### 9.7 legacy 待删清单（PG5 用）

JS：`deploy.js` 剩余 48 个函数中，除 `loadServers`（服务器子页保留的取数）与 `loadProjects`（本步迁完可删）外全部退役——本步是 deploy 页最后一块，**`deploy.js` 应可整体删除**。`app.js` 侧同步删除 `activeTask` / `currentDeployId` / `busyProjects` / `currentProject` / `logViewerStepCount` / `setBusy` / `clearBusy` / `showLogModal` / `updateLogModalCloseBtn` / `openLogViewer` / `appendLog` 与 `logViewer()` 包装（**即第 2 项跨页耦合 `log-viewer-bridge.ts`**）。

CSS：`deploy.css` 剩余 329 行（`.module-item`、`.server-check-item`、`.browser-item`、`.git-log-*`、`.conn-*`、`.spinner`、`.deploy-empty-state` 等）在本步迁完后应可整体删除，与 `deploy.js` 一并归零。

HTML：六个弹窗中的五个（`projectIntroModal` 属全局介绍，非本页专属，保留）。

## 10. M4 独立修复：部署运行态 legacy 全局退役（2026-08-09）

M4 是**当前版本就存在的缺陷**（9.1 节取证），不该等第 6 步弹窗迁完才修，故从本步拆出单独落地。

### 10.1 为什么不能只加一层桥

最初只把 `deploy.js` 的发起流程接到 `deploy-task` store（`window.__deployTask` 桥）。但那样一来 `store.active` 变为非空，`acceptsMessage` 开始收货，而 `app.js` 的 `log` / `progress` / `status` 三个处理器仍常驻——两侧会**同时写同一个 log store**：每行日志追加两次、完成时弹两次提示。桥装上之前 `active` 恒为 null，Vue 侧全被拒收，所以这个双写是引入桥才出现的。

因此修 M4 必须连带退役 legacy 侧的整条部署运行态链路。

### 10.2 落地结构

| 文件 | 变化 |
| --- | --- |
| `services/deploy-realtime-service.ts`（新增 269 行） | 常驻的 log/progress/status 处理器 + 刷新恢复 + WS 重连对账；`stepIndexOf` 与完成回调订阅表移入 |
| `legacy/deploy-task-bridge.ts`（新增 46 行） | `window.__deployTask` = store 的 `begin` / `attachTaskId` / `abandon` |
| `services/modules/deploy-service.ts` | 新增 `getActiveJob`，归一 `/api/deploy/active` |
| `composables/useDeployRealtime.ts` | 175 → 30 行，只剩「挂完成回调、卸载时摘掉」 |
| `MigrationHost.vue` | 启动 `deployRealtimeService`；两个桥先装（恢复流程会经 LogViewer 回放） |
| `app.js` | 1233 → 1073 行 |
| `deploy.js` | 发起流程只调桥，不再维护 legacy 三件套 |

服务必须常驻而非留在 composable 里，有三个理由：构建/部署从项目总览发起而弹窗仍在 legacy 侧，任务可在任何页面发起与完成；`checkActiveJob` 的恢复时机在任何子页挂载之前；与 legacy 处理器并存就会双写。

### 10.3 app.js 退役清单

删除：`activeTask`、`currentDeployId`、`busyProjects` 三个全局；`setBusy` / `clearBusy`；`log` / `progress` / `status` 三个 WS 处理器；`checkActiveJob` 整段；`setStepActive` / `setStepDone` / `getProgressStepCount` 与 `logViewerStepCount`；`updateLogModalCloseBtn`；`closeModal` 的 `logModal` 分支（已无调用方，关闭/最小化由 LogViewer 自身的 requestClose 处理）；孤儿 `openFileInEditor`（内联 onclick 的产出点早已随各页迁移消失，`openFileInEditorByPath` 保留给 MigrationHost）。

`websocket.js` 的 `onopen` 不再直调 `checkActiveJob`——恢复改由订阅 `'open'` 的 Vue 服务承担。

### 10.4 顺带修掉的两个既有缺陷

**M4-a：`checkActiveJob` 的构建任务恢复用错步骤集。** 后端 `activeJobs` 的 `type` 是 `'build' | 'deploy'`，而 legacy 判的是 `job.type === 'build-only'`——恒为 false，于是构建任务（2 步）套上部署的 5 步 phaseMap，`building` 会推进到越界的第 2 步。新实现统一走 `stepIndexOf` 的 compact 分支，单测与 E2E 各锁一条。

**M4-b：`window.sendDesktopNotification` 从未暴露。** 顶层 `function` 在传统脚本里不成为 window 属性，因此 `todo-reminder-service` 的桌面提醒桥一直拿到 undefined，**待办提醒的桌面通知实际是静默失效的**。本次显式挂载（同 `window.WS` 的处理方式），部署完成通知与待办提醒一并恢复。

### 10.5 验证结果

`lint`（CSS 基线 25、Token、架构门禁）/ `build:frontend` / `test:architecture` 全通过；`test:unit` **310 项**通过（新增 26：`deploy-realtime-service` 22、`useDeployRealtime` 4 项改写为只测订阅转发）。

E2E 5 项在测试库（13900）通过：构建发起后卡片亮忙态且 legacy 三个全局确认为 `undefined`、WS 日志与进度**只追加一次**（双写回归的守卫）、完成后解锁并回落操作按钮、500 时本地解锁不卡死、多服务器部署的二次确认与 5 步进度集、刷新恢复登记 store 并回放日志且构建任务用 2 步集。全量回归 68 项中 66 通过——2 项 notes 失败已在 HEAD 上对照确认同样存在，与本次改动无关。

未触发真实构建与部署：全部用 `page.route` 拦截发起端点，只观察前端状态流转。

### 10.6 待用户 Tauri 手动 E2E

自动化没有真实跑过一次构建/部署，需在真机验：从项目总览卡片发起构建、发起部署（含多服务器），确认卡片忙态、日志实时进弹窗、进度条步骤推进、完成提示与桌面通知、最小化后台完成再弹回；构建中刷新页面确认任务恢复；以及待办提醒的桌面通知（M4-b 影响面）。
