# 本地运行页面 Vue 迁移评估

> 状态：Phase 6-1 PG0～PG1 已完成，PG2 清单与方案见 [decision.md](./decision.md)
> 评估日期：2026-07-30
> 当前实现：`frontend/index.html` 中 `#page-run` 旧 DOM + `src/js/run.js`（969 行）+ `src/css/pages/run.css`（618 行）+ `sidecar/routes/run.js`（1036 行）
> 关联计划：[vue3_architecture_migration_execution_plan.md](../../../vue3_architecture_migration_execution_plan.md)

## 1. 评估范围与阶段边界

本页覆盖本地前端项目的启动、停止、重启、批量停止、实时日志、端口占用诊断与强制释放、Node 版本选择、多模块勾选与收藏、项目分组（折叠/排序/重命名）、自动重启和运行历史。

PG0～PG2 只做运行态取证、代码与数据研究、问题分级和方案整理。本阶段：

- 不创建 `RunView.vue`。
- 不修改 Sidecar、SQLite、项目配置或正式页面样式。
- 不调用 `start`、`stop`、`restart`、`batch-stop`、`force-release`、`open-editor` 任何一个有副作用的接口。
- 只访问 `DEVTOOLS_TEST=1` 的 13900 测试 Sidecar，数据目录 `sidecar/data-test`。
- 不访问正式端口 13456 和正式数据库。

本轮已读取：

- `frontend/index.html` 中 `#page-run` 页面 DOM、`#runModal`、`#runHistoryModal` 与共享的 `#logModal`。
- `src/js/run.js` 全量：渲染、分组、弹窗、启动/停止/重启、历史、轮询、强释。
- `src/js/app.js` 的 WebSocket 分发、全局运行态变量、页面切换生命周期、编译报错通知去重、日志着色与编辑器跳转。
- `src/js/deploy.js` 中与本页共用的 `loadProjects`、`loadNodeVersions`。
- `src/css/pages/run.css` 全量。
- `sidecar/routes/run.js` 全量：14 个接口、进程生命周期、输出解析、端口处理。
- `sidecar/services/database.js` 的 `run_history` 表结构。

## 2. 规模与接口

| 项 | 数量 |
| --- | ---: |
| 页面 JS | 969 行 |
| 页面 CSS | 618 行（`!important` 37 处） |
| Sidecar 路由 | 1036 行 |
| 接口总数 | 14 |
| 有真实副作用的接口 | 6 |

### 2.1 接口清单与副作用等级

| 接口 | 方法 | 副作用 | 说明 |
| --- | --- | --- | --- |
| `/api/run/status` | GET | 无 | 全量运行态，对账用 |
| `/api/run/:id/logs` | GET | 无 | 历史日志回放 |
| `/api/run/history` | GET | 无 | 最近 100 条 |
| `/api/run/port-check/:port` | GET | 无 | 仅 LISTEN 套接字 |
| `/api/run/port-owner/:port` | GET | 无 | 返回占用进程 pid/user/command |
| `/api/run/history/:id` | DELETE | 低 | 删单条历史 |
| `/api/run/history` | DELETE | 低 | 清空历史 |
| `/api/run/start` | POST | **高** | spawn 真实 dev server 进程 |
| `/api/run/:id/stop` | POST | **高** | SIGTERM → 2.5s 后 SIGKILL 进程树 |
| `/api/run/:id/restart` | POST | **高** | 停后就地重启 |
| `/api/run/batch-stop` | POST | **高** | 批量终止 |
| `/api/run/:id/open` | POST | 中 | `execFile('open', urls)` 拉起浏览器 |
| `/api/run/open-editor` | POST | 中 | 拉起 VS Code 或系统 open |
| `/api/run/force-release` | POST | **最高** | `process.kill(-pid, 'SIGKILL')` |

`force-release` 是全项目目前副作用最大的操作：直接强杀指定 pid 的整个进程组，**不校验该进程是否由本应用启动**（`sidecar/routes/run.js:970-989`）。`port-owner` 同样只回传 pid，不判归属。自动化测试绝不触碰此接口，即使在测试端口上也不碰。

对比之下 `ensurePortAvailable` 是有归属判断的：收集 `runJobs` 中活跃 job 的 pid 组成 `devtoolsPids`，属于本应用的旧进程直接停，外部进程抛 `EADDRINUSE` 交给用户决定（`sidecar/routes/run.js:388-417`）。这个区分必须在迁移后保留。

## 3. 数据流与实时链路

`src/js/run.js` 内**没有任何 WebSocket 代码**，实时链路全在 `src/js/app.js`：

- `WS.on('run-log')`（`app.js:774`）：按 `data.id !== currentRunId` 过滤，命中则 `appendLog`。
- `WS.on('run-status')`（`app.js:817`）：维护 `runningProjects` / `portOccupancyAlerts`，触发桌面通知与编译报错通知去重，然后扇出到 `updateRunLogStatus` + `renderProjects` + `renderRunPage` + `requestHomeRefreshIfVisible` + `syncTrayMenu`。
- `WS.on('open')`（`app.js:806`）：重连后全量 `loadRunStatuses()` 对账，纠正断线期间丢失的推送。

关键结论：**运行态是全局单例，且被首页卡片和系统托盘菜单共享**。`RunView` 不能把运行态私有化到页面内，必须落在共享 store（计划文档 1139 行的 `useRunStore` 要求）。

### 3.1 三道兜底机制（缺一不可）

1. `WS.on('run-status')` —— 状态变化时的主推送。
2. `WS.on('open')` —— 重连后全量对账。
3. 15 秒轮询（`run.js:908-921`）—— 双职责：① 刷新卡片「运行时长」文本（WS 仅在状态变化时推送，稳定运行的服务不会触发重渲，时长会停在旧值）；② 与后端对账（WS 丢事件或瞬断时内存运行态可能失真）。**仅在有运行中项目时才请求后端**，空闲不轮询；`switchPage` 离开页面时 `stopRunPagePolling`（`app.js:1032`）。

PG0 实测意外验证了机制 ③ 的对账职责有效：手工注入的假运行态卡片在 15 秒后被轮询对账清除。

迁移时这三道不能简化为「统一定时刷新」或「纯 WS 驱动」，否则会退化。

## 4. 必须原样保留的实现语义

| 语义 | 位置 | 原因 |
| --- | --- | --- |
| 轮询双职责 + 仅运行中才请求 | `run.js:908-921` | 见 3.1 |
| `restart` 不用 `withButtonBusy` | `run.js:751-769` | 重启接口立即返回，后台才停+重启；用 `withButtonBusy` 会在接口返回即解锁，连点窗口重现 |
| `canRestart` 仅 `running` 放开 | `run.js:260` | 启动中/停止中禁用防连点 |
| `lsof -sTCP:LISTEN` 过滤 | `sidecar/routes/run.js:349`、`936` | 不加会把浏览器到该端口的 HMR 重连误判为占用，导致停止后再启动报占用 |
| 强释后轮询确认端口真释放 | `run.js:933-943` | 替代固定 800ms；TIME_WAIT 回收慢时定长延时不够，重启会再次 EADDRINUSE |
| `processJobClose` 的 `attempt` 守卫 | `sidecar/routes/run.js:650` | 防重启/重试后旧进程的 close 事件串号污染新进程状态 |
| 启动意图透传强释路径 | `run.js:538`、`552`、`575` | 端口冲突走强释时不丢 `autoRestart`/模块/命令选择 |
| 外部进程 vs 本应用进程区分 | `sidecar/routes/run.js:388-417` | 见第 2.1 节 |
| 编译报错通知延时去重 | `app.js:868-887` | 按 `jobId:compileErrorSeq` 去重，任务结束时清理，避免 Set 只增不减 |
| 多模块 `open` 逐个开 `<模块>.html#/` | `sidecar/routes/run.js:906-926` | 多模块 Vue 项目每个模块是独立入口页 |
| 两种空态区分 | `run.js:178-187` | 从未添加项目 → 引导添加；被筛选过滤光 → 提示无匹配 |
| 「多模块项目数」统计口径 | `run.js:166-167` | 原「已保存命令」恒等于项目总数，无信息量 |

## 5. PG1 发现的功能缺陷

### 5.1 运行历史「模块」列恒为 `—`

后端 `readRunHistory` 返回字段名为 `modules`（`sidecar/routes/run.js:22`，与 `run_history` 表列名一致），前端读 `h.moduleNames`（`run.js:810`）。字段名不匹配，该列永远显示 `—`。

### 5.2 运行历史「手动停止」档永远走不到

前端按 `success` / `stopped` / 其他分三档渲染（`run.js:806-809`），意图是区分「自然结束 / 我停的 / 它崩的」。但入库时 `job.status === 'stopped' ? 'success' : job.status`（`sidecar/routes/run.js:33`）把 `stopped` 改写成 `success`，于是手动停止与自然退出都显示「已结束」。该注释想要的区分是死的。

### 5.3 配置中的「服务端口」不参与实际启动

前端 `startRunJob` 不传 `port`（`run.js:521-528`），后端 `port: port || inferProjectPort(project, finalCommand)`（`sidecar/routes/run.js:819`）于是永远走推断，而 `inferProjectPort` 只读命令行参数和项目配置文件（`vue.config.js`/`vite.config.*`/`config/index.js`/`build/dev-server.js`），**从不读 `project.runPort`**（`sidecar/routes/run.js:155-191`）。

结果：用户在配置里填的端口只被用于占用检测（`checkPortOccupancyForProject`）和强释后的轮询确认，而 `buildRunEnv` 注入的 `PORT`/`VITE_PORT`/`npm_config_port` 拿的是推断值。填了端口却不生效，且无任何提示。

> 5.1 与 5.2 本轮只有代码证据。测试库运行历史为空，补运行态证据需真跑一次启停（会写历史表、动真实进程），按门禁属用户手动 E2E 范围，本阶段不代劳。

## 6. PG0 运行态取证

### 6.1 隔离环境

- 测试 Sidecar：已在运行的 PID 98212，`DEVTOOLS_TEST=1`，端口 13900，`dataDir=sidecar/data-test`（`/api/health` 确认），未重启。
- 前端：Vite 1420，访问 `http://127.0.0.1:1420/?apiPort=13900`。
- 测试库数据：3 个项目 —— `b8seed-portal`（multi-module，6 子模块，Node 18.20.4）、`b8seed-blog`（single，webpack，系统默认）、`b8seed-shop`（single，vite，Node 20.11.1）。运行历史为空，无运行中任务。
- 运行态、端口占用态、编译报错态均通过**改前端内存变量 + 直接调用渲染函数**模拟，未调用任何副作用接口。
- 收尾核对：`/api/run/history` 与 `/api/run/status` 均为 `[]`；`localStorage` 的 `runCollapsedGroups`/`runGroupOrder` 已清除；主题回暗色；`git status` 干净。
- preview 首次打开时默认标签曾连正式端口 13456 发出一批只读 GET（projects/run-status/usage 等），无任何写操作；随后切至 13900。

### 6.2 尺寸与滚动测量

| 窗口 | 主题 | 内容区可视 | 内容高度 | 需滚屏数 | 横向溢出 | 网格列 |
| --- | --- | --- | ---: | ---: | --- | --- |
| 1665 × 1184 | 暗 | 1469 × 1015 | 1015px | 1.00 | 无 | 3 × 479px |
| 1274 × 1151 | 暗 / 亮 | 1078 × 982 | 982px | 1.00 | 无 | 3 × 348.7px |
| 900 × 600 | 亮 / 暗 | 717 × 435 | 736px | 1.69 | 无 | 2 × 348.5px |

页面层三档均无横向溢出，工具栏在静态态齐平 34px 一条线（搜索框 360px、4 个 chip、历史按钮同高，`toolbarScrollW === toolbarClientW`）。这部分明显优于 usage 页迁移前（该页 900px 下有 71px 页面级横向溢出）。

### 6.3 视觉与交互问题

以下 5 项在静态默认窗口下不可见，均需特定尺寸或状态组合才触发：

**P1 窄窗口有运行中服务时工具栏换行。** 「■ 全部停止」按钮出现后，`#page-run .page-toolbar` 高度从 36px 变为 78px，「📋 运行历史」被挤到第二行，白吃掉一行首屏高度。仅在「窄窗口 + 有运行中项目」组合下触发。

**P2 运行中卡片 4 个按钮换行。** `.run-card-actions` 从 34px 变 76px，「停止/重启/查看日志」一行，「打开地址」单独掉第二行并拉成通栏（实测 4 个按钮 `top` 为 147/147/147/189）。

**P3「⚡ 一键释放并启动」按钮文字截断溢出。** 端口占用态下 3 个按钮平分 100px 宽，长标签溢出到按钮外并压住卡片边界。这是端口占用态最需要看清的操作按钮。

**P4 配置弹窗窄窗口双层嵌套滚动。** 模块选择器自带 180.5px 滚动区，外层 `.modal-body` 还需滚动（`scrollHeight 600 / clientHeight 394`）。启动命令、服务端口、分组、自动重启 4 行全在折叠线以下，且滚轮落在模块区时只滚内层。

**P5 同一弹窗两种模式宽度差 250px。** 启动模式 760px 双栏（`393px + 322px`），配置模式被 `run.css:326` 的 `width: min(540px,88vw) !important` 锁到 513px 单栏。从卡片「配置」切到「启动」会看到弹窗尺寸跳变。

**P6 分组视图单项目组留半幅空白。** 分区头通栏 709px，组内卡片仍按 348px 固定列宽渲染，只有一个项目时右侧空一半。分组头右侧 ↑↓✎ 三个图标按钮在窄窗口挤在一起，`✎` 字形显示异常。

### 6.4 语义矛盾

编译报错时进度条停在约 65%，状态文字为「运行中 · 编译报错」——服务实际已启动，进度被 `35% → 100%` 两档硬编码卡在中间（`run.js:868-882`）。

红色贯通本身完整：步骤 chip、进度条、footer、日志三档着色（error/warn/success）、文件路径可点跳编辑器（`.log-editor-link` → `/api/run/open-editor`）均正常。问题只在进度条这一处的语义。

## 7. 架构约束

### 7.1 日志弹窗与部署页共享

`#logModal` 是本页与部署页共用的同一份 DOM，靠 `activeTask.taskKind === 'run'` 区分（`app.js:1433`、`run.js:658`）。`run.css:495-522` 还压着 `#logModal .step.done` 与 `#logModal.run-compile-error` 的样式，含 `body[data-theme="dark"]` 变体。

计划文档 1153 行本就要求「部署日志和本地运行日志复用公共 Log Viewer」。因此 run 页迁移绕不开：要么先抽公共 LogViewer 组件，要么接受一段时间的新旧共存。这是本页与前几页最大的结构差异。

同时共享的还有：`appendLog`、`setStepActive`/`setStepDone`、`updateLogModalCloseBtn`、日志搜索（Cmd+F）、`colorizeAndLinkLog`、`openFileInEditor`，全部在 `app.js`。

### 7.2 CSS 归属混乱

`run.css` 618 行中：

- 37 处 `!important`，集中在工具栏对齐（压制 `overrides.css` 的 `.chip{min-height:24px !important}`）、搜索框、`.modal-run` 宽度、`.ha-table` 单元格。
- 含**本不属于本页**的 `.ha-table` 全局规则（`run.css:8-40`、`525-537`），与 `components.css:106/354/610` 和 `overrides.css:199/340` 三处重叠，`deploy.css:695` 还有一条注释记录了同样的压制关系。
- 含 `#page-run` ID 选择器与 `#logModal` 跨页选择器。

### 7.3 共享依赖

`projects` 全局数组由 `deploy.js` 的 `loadProjects` 加载，本页与部署页、首页共用（计划文档 1155 行要求「与 run 共用项目 store」）。`nodeVersions` / `currentNodeVersion` 同由 `deploy.js` 的 `loadNodeVersions` 提供。项目分组的 `groupName` 写在项目实体上（`PUT /api/projects/:name`），折叠态与自定义排序存 `localStorage`（`runCollapsedGroups`、`runGroupOrder`）。

## 8. 已具备的 Vue 基础设施

`frontend/src/components/` 下 base（Button/Card/Badge/IconButton/Progress/StatusIndicator）、form（Input/Select/Checkbox/Switch/Radio/Textarea/FormField/DateTimePicker）、feedback（BaseDialog/ConfirmDialog/EmptyState/ErrorState/LoadingState/AppToastHost）、layout（PageFrame/PageBody）、overlay（BaseDropdownMenu）、navigation 均已就位。

composables 已有 `use-interval`、`use-page-visibility`、`use-event-listener`、`use-resize-observer`、`use-async-state`。services 已有类型化 `api-client`、`websocket-client`（含 `on(type, handler)` 返回取消函数）、`tauri-client`。stores 已有 `app`、`notification`、`settings`。

缺口：无 LogViewer 组件、无 `useRunStore`、无 `run-service.ts`、无进程/运行任务类型定义、无表格组件（运行历史当前手拼 `.ha-table`）。
