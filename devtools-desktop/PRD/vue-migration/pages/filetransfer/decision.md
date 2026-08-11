# 文件传输页面迁移决策

> 状态：**PG0～PG5 已完成，Phase 6-3 已关闭**（2026-08-11）；用户 Tauri 手测通过，legacy 已删
> 关联评估：[assessment.md](./assessment.md)
> 产出日期：2026-08-11

本文含 PG2 建议与 PG3 冻结范围。PG4 不得静默扩大；新想法回退 PG2/PG3。

## 1. 必须保持等价的既有设计

以下经 PG0/PG1 确认是有意为之，迁移后必须保持等价行为，不在本轮「顺手改掉」：

1. **同 `serverId` 会话池复用**：后端一池一条；前端可开多 tab，但同服务器再连是切到已有 tab，不是再建一条 SSH。
2. **活动态是 tab 镜像**：`sessionId` / 远程路径 / 列表 / 选中集属于当前 tab；切 tab 必须先 save 再 restore，否则会操作错会话。
3. **本地栏跨 tab 共享**：只换远程上下文，不重置本地路径与选中（除非用户自己操作）。
4. **Keepalive**：每 tab 独立 60s；失败或 410 → 关该 tab + disconnect + toast；**不是**自动重连。
5. **传输启动竞态**：WS `started` 可能早于 HTTP 返回 `taskId`，必须能 backfill `sessionId`，否则完成后无法刷新对应远程列表。
6. **取消是软取消**：进行中的单文件会跑完；无断点续传。
7. **冲突策略**：`overwrite` / `skip` / `rename` 语义与入队参数不变。
8. **无文件拖拽互传**：传文件仅右键（或等价菜单动作）；分隔条只调栏宽。
9. **偏好键名不变**：`ft.splitRatio` / `ft.localSort` / `ft.remoteSort`。
10. **切页 ≠ 断连**：离开「文件传输」页不销毁 SFTP 会话、不停止 keepalive、不丢队列（与计划「隐藏 UI ≠ 关闭连接」一致）。
11. **服务器列表本页自取**：`GET /api/servers`（D0）；不恢复已删的 deploy → 全局 `servers` 桥。

## 2. 建议清单

### 2.1 架构必修（迁 Vue 时必须落地，不算「功能优化」）

这些是主计划 Phase 6-3 明确要求，也是 assessment D2/D3 的根因。选 L0 也要做：

| 编号 | 问题 | 建议 |
| --- | --- | --- |
| A1 | 模块级镜像 + 无 session store，重挂载易丢上下文 / 重复绑事件 | 建立明确 session model（建议 `useFileTransferStore` 或应用级 session 宿主），tabs / 队列 / 活动 id 不挂临时 DOM |
| A2 | `WS.on('transfer')` 只绑从不 `off` | 单一订阅入口，可追踪销毁；防重复处理同一消息 |
| A3 | keepalive 散落 `setInterval` | 每会话由 composable 管理；关 tab / 卸载时 `clearInterval` |
| A4 | 「隐藏 UI」与「关闭连接」未显式建模 | 路由/页切换只隐藏 View；disconnect 仅关 tab / 用户断开 / 会话丢失 |
| A5 | 传输任务归属 DOM 渲染 | 队列状态进 store/service；组件重渲染不得丢任务 |

### 2.2 文档 / 验收对齐（assessment D1）

| 编号 | 问题 | 建议 |
| --- | --- | --- |
| D1 | 主计划验收写过「断线重连」，实现是关 tab | **PG3 书面对齐**：本轮基线 = 丢失即关 tab；若要自动重连，单列为 L3 子阶段，不混进架构迁移 |

### 2.3 建议视觉 / 组件统一（L1 默认纳入）

| 编号 | 问题 | 建议 |
| --- | --- | --- |
| D4 | 工具栏 / 栏标题大量 emoji（💻🖥🏠⬆↻ 等），队列方向也用 emoji | 统一改描边 SVG（`BaseIconButton` / 页内 stroke icon），与 run/deploy/twofa 一致 |
| V1 | 原生 `<select>`、手写 status pill、手写按钮 | `BaseSelect` + `StatusIndicator` / `BaseBadge` + `BaseButton` / `BaseIconButton` |
| V2 | 空态 / 忙态手写 | `EmptyState` / `LoadingState`；连接按钮走 `loading` |
| V3 | `showPrompt` / `showConfirm` / 运行时 `#ftCtxMenu` | `ConfirmDialog` + Prompt 型 `BaseDialog`；右键用 `BaseDropdownMenu`（或页内 context menu，样式对齐 overlay） |
| V4 | 页面骨架未进 Vue 壳惯例 | `PageFrame` / `PageHeader` / `PageToolbar` / `PageBody` 套壳；双栏定高逻辑迁 scoped CSS，token 驱动 |
| V5 | 队列进度条手写 | `BaseProgress`（line）；完成/失败态克制着色，不做大块区域染色 |

### 2.4 建议体验优化（可选，默认归 L2）

| 编号 | 问题 | 建议 |
| --- | --- | --- |
| D5 | 900×600 堆叠后 tabs + 路径栏密度高 | 窄屏下压缩工具栏文案为 icon-only、tabs 可横向滚动；**不改**信息架构 |
| D6 | 冲突策略与队列贴底，长列表时要滚才看见进度 | 队列区固定贴工作区底（已有结构）并保证最小可视高度；或进行中任务摘要上浮一条——属布局微调，需原型或明确文案确认 |
| O1 | 连接 hint / 状态文案偏挤 | 文案与截断策略微调，不改操作流 |

### 2.5 不建议在本轮处理（或必须拆 L3）

- **自动断线重连 / 失败自动重试**（改变会话生命周期）→ **L3-A**，独立子阶段 + 测试。
- **文件拖拽本地↔远程互传**（新交互面 + 冲突/权限边界）→ **L3-B**。
- **断点续传 / 硬取消正在写的文件**（改 `transferQueue` 语义）→ **L3-C**，涉后端。
- **改 keepalive 间隔或服务端 idle 5min 回收策略** → 涉 SFTP 会话语义，独立评审。
- **与 deploy 远程浏览合并成一个组件库大一统** → 可复用 list/path 模式，但本轮不强制抽公共「双栏文件浏览器」；先页内拆分，重复出现再提升。

## 3. 公共组件复用计划

| 本页结构 | 复用 / 新建 | 说明 |
| --- | --- | --- |
| 页头 / 工具栏 | `PageFrame` 等 layout | 与已迁页一致 |
| 服务器下拉 | `BaseSelect` | 替代原生 select |
| 连接 / 刷新 | `BaseButton` / `BaseIconButton` | busy/disabled |
| 连接状态 | `StatusIndicator` 或 `BaseBadge` | 未连接 / 连接中 / 已连接 |
| 远程多会话 tabs | `BaseTabs` 或页内 tabs | 需支持关闭按钮；若 `BaseTabs` 契约不够则页内实现并登记是否回馈公共 |
| 路径输入 | `BaseInput` | 建议列表可为页内 popover |
| 文件行多选 | `BaseSelectableItem`（row）或页内 list | 保留 Shift 范围选 |
| 右键菜单 | `BaseDropdownMenu` | 打开 / 传 / 重命名 / 删 |
| 新建·重命名·删除 | `BaseDialog` / `ConfirmDialog` | 替代 `showPrompt` / `showConfirm` |
| 队列进度 | `BaseProgress` | phase 文案页内 |
| 冲突策略 | `BaseSelect` 或 `BaseSegmented` | overwrite/skip/rename |
| Toast / 桌面通知 | `useNotificationStore` + 既有桌面通知适配 | target 仍指向 filetransfer |
| 分隔条 | **页内** `FtSplitter` | 无现成公共 splitter；先私有，不凭空公共化 |
| 文件列表虚拟化 | **本轮不做** | 现网列表体量未证明需要 |

**若实现中发现公共能力不足，按 CA-09 先扩公共组件、同步清单与预览、再接入页面**，不得在页面内绕过。

## 4. 删除清单（随 PG5，预登记）

- `src/js/filetransfer.js` + `index.html` script
- `src/css/pages/filetransfer.css` + link（确认无其它消费者）
- `#page-filetransfer` 静态 DOM → Vue host
- 内联 `onclick` / `onchange`
- `app.js` 中 `initFileTransfer()` 分支
- 运行时 `#ftCtxMenu`
- 对本页 emoji / 手写 progress / 原生 select 的依赖

## 5. 新增清单（架构向）

| 项 | 说明 |
| --- | --- |
| `filetransfer-service.ts` / `fs-local-service.ts`（或合并模块） | 类型化 SFTP + 本地 FS + servers 列表 |
| `useFileTransferStore`（或 session 宿主） | tabs、活动会话、队列、偏好；切页保活 |
| `useSftpSessionKeepalive` | 每会话 timer；销毁可追踪 |
| `useTransferRealtime` | 唯一 `transfer` WS 订阅 + backfill |
| View 拆分 | 会话栏、本地栏、远程栏、tabs、队列、context menu |
| 单测 | store 镜像切换、WS 竞态 backfill、keepalive 清理；E2E 以壳层 + 可 mock 路径为主，真 SFTP 仍靠 Tauri 手测 |

## 6. L0～L3 方案

### L0 等价迁移

只搬架构与 A1～A5，视觉/文案/交互尽量不变（含 emoji）。

- **不推荐**：会把 D4 emoji 与原生控件固化进 Vue，随后还要再开一轮视觉债；且与全站「新 UI 无 emoji / 无原生控件」规范冲突。

### L1 等价迁移 + 组件 / 视觉统一（**推荐**）

L0（含 A1～A5、D1 文档对齐）+ §2.3 全部（D4、V1～V5）。

- **冻结任务语义**：不自动重连、不拖拽互传、不改取消/冲突/池化规则。
- **不需要 HTML 原型**（不改信息架构与主操作流；解法对齐已迁页面组件）。
- 窄屏仅做「不撑破、可点」级修复；D5/D6 大改不纳入。

### L2 L1 + 窄屏 / 队列布局微调

再纳入 D5、D6、O1。若改队列「进行中摘要上浮」等结构，需亮/暗 + 900×600 原型后确认。

### L3 功能增强（默认不做，拆子阶段）

| 编号 | 内容 | 风险 |
| --- | --- | --- |
| L3-A | 断线自动重连（保路径/选中/队列策略另定） | 高：会话生命周期、与池复用/多 tab 冲突 |
| L3-B | 拖拽上传下载 | 中高：交互面 + 权限/冲突 |
| L3-C | 硬取消 / 断点续传 | 高：改 `transferQueue` |

## 7. 推荐结论（供 PG3 勾选）

**推荐：L1**（架构 A1～A5 + 视觉/组件统一 D4、V1～V5；D1 书面确认「无自动重连」）。

理由：

1. 本页复杂度高（会话镜像、队列竞态、keepalive），架构迁移本身风险已够，不宜叠 L3 会话语义。
2. 计划默认预期即「L1/L2 视觉统一、任务语义冻结」；L1 已覆盖合规与可维护性，不必为双栏换皮做 L2 原型。
3. 用户 Tauri 补证已通过连接 → 传输 → 切页保活；基线可信，适合直接按等价+组件化实现。

**默认不纳入**：D5/D6 的结构性改版、全部 L3。

## 8. 实施顺序建议（PG3 确认后细化）

1. Service + 类型（SFTP / FS / servers）
2. Store：tabs 镜像、队列、偏好；单测竞态 backfill
3. Keepalive + transfer WS composable（可销毁）
4. 壳 + 会话栏 + 双栏列表（先本地，后远程 tabs）
5. 右键菜单与 mkdir/rename/delete
6. 传输入队与队列 UI
7. E2E（壳/关键路径）+ 用户 Tauri 手测
8. PG5 删 legacy

## 9. PG3 用户确认结论（2026-08-11）

用户回复「确认」，采纳第 7 节推荐方向，五项决定如下：

1. **优化等级 L1**：架构 A1～A5 + 视觉/组件统一（D4、V1～V5）。
2. **D1**：本轮验收基线为「会话丢失 → 关 tab，**无**自动重连」。
3. **D5/D6**：本轮不做结构性改版。
4. **L3-A/B/C**：全部不做（不自动重连、不拖拽互传、不硬取消/断点续传）。
5. **原型**：不需要 HTML 原型；直接进 PG4。

第 2.4 / 2.5 节不处理项维持原判。若实现中出现新的布局或交互想法，暂停并回退 PG2/PG3。


## 10. PG5 与关闭（2026-08-11）

用户确认真实 Tauri 手测无问题后执行：

- 删除 `src/js/filetransfer.js`、`src/css/pages/filetransfer.css`
- 移除 `index.html` 对 `filetransfer.js` 的 script 引用
- 正式实现保留：`views/filetransfer/`、`stores/file-transfer.ts`、`filetransfer-service.ts`、`filetransfer-session-service.ts`
