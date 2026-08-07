# 部署面板页面迁移决策

> 状态：**PG3 已通过（2026-08-06，用户确认采纳推荐方向）**，PG4 实现进行中——项目总览子页已闭环；服务器管理子页 PG4 自动验证完成，待用户真实 Tauri 手动 E2E 后进 PG5
> 关联评估：[assessment.md](./assessment.md)
> 产出日期：2026-08-06

本文是 PG2 产出：建议清单、公共组件复用计划、风险说明与分级方案。所有条目均待用户在 PG3 确认，不代替用户选择方向。

## 1. 必须保持等价的既有设计

以下经 PG1 确认是有意为之，迁移后必须保持等价行为，不在本轮"顺手改掉"：

- **任务失败本地解锁**：请求未发出时后端不回 WS 完成事件，必须本地 `clearBusy`，否则卡片永久卡在 ⏳ 需重启软件。
- **WS 与 HTTP 竞态兜底**：`activeTask.id` 为 null 的窗口必须显式建模，WS 消息可能先于 HTTP 响应到达。
- **密码掩码跳过提交**：前端用 `/^\*+$/` 识别掩码值并不提交 `password`，删掉会静默清空用户密码。
- **分组语义与本地运行页共享**：`groupName`（后端）与 `runGroupOrder`（localStorage）同源双向影响，折叠态各自独立。
- **两套模块偏好互不相通**：localStorage 的 `fav_*` / `last_*` 与后端 `favoriteRunModules` 不可合并。
- **步骤映射**：构建 2 步、部署 5 步，phase → 步骤索引的对应关系不可改变。
- **Node 版本变更即时落库**：弹窗内改 Node 版本会先 `PUT /api/projects/:name`，失败静默。

## 2. 建议清单

### 2.1 必修缺陷（PG0 取证发现）

| 编号 | 问题 | 建议 | 依据 |
| --- | --- | --- | --- |
| D1 | 分组头样式孤儿：`padding: 0`、无背景、`cursor: auto`，退化成裸文字且折叠可点性不可见 | 接入 `BaseDisclosure panel` 变体，与本地运行页统一 | 主计划已登记为本阶段准入前提 |
| D2 | 单项目分组卡片只占三分之一宽，10 个项目分散 6 组，首屏只能看 5 张卡 | 网格改 `auto-fit` 折叠空轨道，与本地运行页 P6 同解 | 本地运行页已验证 |
| D4 | 项目卡写死 `height: 230px`，未配置服务器的项目卡内明显留白 | 改用 `BaseEntityCard` 的固定行数状态区实现等高，高度由内容决定 | 本地运行页已验证 |
| D5 | emoji 图标（📦 📄 🔨 🚀 ⚙ 🗑）跨系统渲染不一致且自带彩色 | 统一改描边 SVG | 本地运行页与双因验证页已统一 |

### 2.2 建议优化（可选，需 PG3 确认取舍）

| 编号 | 问题 | 建议 |
| --- | --- | --- |
| D3 | 分组头信息密度低于本地运行页，缺状态摘要 | 补"已配置 N / 待配置 N"或构建汇总；数量改胶囊徽标 |
| O1 | 整张卡 `onclick="openDeployModal"`，内部 4 个按钮全靠 `event.stopPropagation()`（全页共 8 处） | 取消卡片整体可点，改为只有明确按钮触发。理由：整卡可点与"部署"是破坏性操作叠加，误触代价高 |
| O2 | `deploy.css` 有 93 处 `!important` | 迁移后页面 CSS 归零 `!important`，legacy 文件随 PG5 删除 |
| O3 | 卡片 `card-last-deploy` 成功态带绿边绿底 | 按既有克制标准改为语义点 + 文字，不做区域上色 |
| O4 | 模块标签固定展示前 5 个 | 与本地运行页统一为前 3 个 + `+N`，保持两页节奏一致 |

### 2.3 不建议在本轮处理

- **服务器管理与部署历史两个子页的视觉**：PG0 取证未发现问题，本轮只做架构迁移不重设计。
- **构建/部署协议本身**：任何改变任务语义、SSH 行为或历史清理规则的想法都必须拆独立功能子阶段。
- **`.run-group*` 在 legacy 侧补样式**：D1 由 Vue 侧接入公共组件解决，补 legacy 样式属于白做。

## 3. 公共组件复用计划

PG1 与共享清单对照后，本页所需能力**几乎全部已有**，预计无需新增公共组件：

| 本页结构 | 复用组件 | 说明 |
| --- | --- | --- |
| 项目卡 | `BaseEntityCard` | icon/title/headerExtra/meta/body/status/actions 与本页结构一一对应；用 `statusPlacement="body"` 承载"服务器配置 + 最近部署"两行 |
| 项目分组 | `BaseDisclosure panel` | 直接解决 D1 |
| 三个子页切换 | `BaseTabs` | 项目总览 / 服务器管理 / 部署历史 |
| 服务器列表 | `BaseDataTable` | 7 列表格，替代手写 `<table>` |
| 部署历史 | `BaseDataTable` | 122 条记录 + 批量选择 |
| 类型/状态筛选 | `FilterChip` | 替代 `chipFilters` 手写 chip |
| 11 个弹窗 | `BaseDialog` / `ConfirmDialog` | 见下表 |
| 构建/部署进度 | 公共 LogViewer | 删 `legacy/log-viewer-bridge.ts` |
| 模块勾选 | `BaseCheckbox` + `BaseSelectableItem` | 替代 `module-item` 手写实现 |
| 表单 | `BaseInput` / `BaseSelect` | 服务器表单、清理参数 |
| 通知 | `useNotificationStore` | 替代 `showToast` |
| 进度条 | `BaseProgress` | 已有 |

弹窗归属（10 个，`projectIntroModal` 属全局非本页）：

`buildModal`、`deployModal`、`projectConfigModal`、`addProjectModal`、`serverFormModal`、`remoteBrowserModal`、`filezillaModal`、`cleanupModal`、`edBrowserModal`(编辑器共用)、以及历史日志查看。

**若实现中发现公共能力不足，按 CA-09 先扩公共组件、同步清单与预览、再接入页面**，不得在页面内绕过。

## 4. 分级方案（待 PG3 选择）

### L0 等价迁移
只搬架构，不改任何视觉与交互。**不推荐**：D1/D2 是当前已存在的可见缺陷，等价迁移会把它们固化进 Vue 实现。

### L1 等价迁移 + 必修缺陷（推荐）
在 L0 基础上修 D1、D2、D4、D5 四项。这四项都有本地运行页的现成解法，风险低、收益直接：分组头恢复可用、首屏卡片数从 5 提到 9～10、卡片高度自适应、图标跨平台一致。

### L2 L1 + 建议优化
再纳入 D3、O1、O3、O4。其中 **O1（取消整卡可点）改变交互习惯**，需你明确确认；O3/O4 是与其他页面对齐视觉标准。

### L3 重新设计
本页信息密度与子页结构在 PG0 取证中未发现硬伤，**不建议**。

**我的推荐：L1，并单独确认 O1 是否一并处理。** 理由：本页是剩余页面里体量最大的（1632 行 JS + 87 个全局函数 + 24 个 API 端点 + 10 个弹窗），且任务状态机跨 `app.js`，架构迁移本身风险已经足够高；把视觉改动限制在有现成解法的四项，可以让"迁移是否等价"这个判断保持清晰。O1 单独拎出来是因为它是唯一会改变肌肉记忆的交互项。

## 5. 实施顺序建议（PG3 确认后细化）

考虑到本页跨文件耦合，建议按能力而非按子页切分：

1. **任务状态机进 store**：`activeTask` / `currentDeployId` / `busyProjects` / WS 三个处理器一起搬，先建 `useDeployTaskStore` 并补竞态与失败解锁的单测。
2. **Service 层**：24 个端点按项目/服务器/部署/历史四类建类型化 service。
3. **项目总览子页**：卡片 + 分组，接入 `BaseEntityCard` 与 `BaseDisclosure panel`。
4. **服务器管理子页**：`BaseDataTable` + 服务器表单弹窗，注意密码掩码契约。
5. **部署历史子页**：`BaseDataTable` + 筛选 + 批量删除 + 清理弹窗。
6. **构建/部署弹窗**：模块勾选、Node 版本、服务器选择、远程路径浏览。
7. **PG5 清理**：删 `deploy.js`、`deploy.css`、`log-viewer-bridge.ts`，收敛 `runningProjects` 与 `loadRunStatuses`，清理 `index.html` 中的 22 个内联 `onclick`。

每步完成后跑 `npm run lint`（含架构门禁零基线）、单测与该子页 E2E，不累积到最后。

## 6. PG3 用户确认结论（2026-08-06）

用户确认采纳推荐方向，三项决定如下：

1. **分级 L1**：等价迁移 + 修 D1、D2、D4、D5 四项必修缺陷。
2. **O1 不在本轮处理**：卡片整体可点保留现有行为，`event.stopPropagation()` 的兜底一并保留。该项转为 L2 候选，本轮不改交互习惯。
3. **不做 PG3 原型**：L1 的视觉解法全部复用本地运行页已验证的实现（`BaseEntityCard` 等高卡片、`BaseDisclosure panel` 分组容器、`auto-fit` 网格、描边 SVG 图标），无新设计需要评审，直接进 PG4。

第 2.2 节的 D3、O1、O3、O4 与第 2.3 节的不处理项均维持原判，本轮不实施。若实现中出现新的布局或交互想法，按门禁规则暂停实现并回到 PG2/PG3，不在代码中静默扩大范围。

## 7. 服务器管理子页 PG2/PG3 补充（2026-08-07）

整页 PG0 曾判定「服务器管理子页未发现问题」，本子页补充取证（assessment 第 3.3 节）推翻了这一条：发现 D6、D7 两项页面级缺陷与 S1～S3 三项 Service 层契约缺陷。因超出原 PG3 覆盖范围，已单独提交用户确认，结论如下。

| 编号 | 问题 | 确认方向 |
| --- | --- | --- |
| D6 | FileZilla 弹窗因 `escapeHtml(s.port)` 抛异常而完全打不开 | **随 Vue 迁移一并解决**，不单独改 legacy。Vue 模板插值不经过 `escapeHtml`，缺陷在新实现中自然不存在；`escapeHtml` 是全局函数，为本页单独加 `String()` 兜底会扩大影响面，不做 |
| D7 | 认证方式下拉只有 `password` 一个选项 | **改为静态文本「密码」**，不渲染下拉。提交时 `authType` 仍固定传 `password`，后端契约不变 |
| S1 | `parseFileZillaXml` 发 `{ xml }`，后端读 `xmlContent` | PG4 修正字段名 |
| S2 | 两个 filezilla 读取端点返回 `{ path, servers }`，service 按裸数组解析 | PG4 修正解析结构，`GET /filezilla` 的 `path` 一并取出供弹窗副标题使用 |
| S3 | `FileZillaServer` 类型缺 `exists`，三态语义依赖它 | PG4 补字段，并为三个 filezilla 函数补单测（当前零覆盖） |

维持不变的判断：

- 本子页**不做视觉重设计**（原 2.3 节结论），表格、列宽、窄窗口列隐藏、长文本截断、空态与失败态取证均正常，等价迁移即可。
- 不做 PG3 原型：D7 是控件降级、D6 是缺陷消除，均无新设计需要评审。
- 「将删除」文案与后端 import 不执行删除的语义不对齐属既有问题，本轮不改（assessment 5.5）。

## 8. 服务器管理子页 PG4 实现结果（2026-08-07）

### 8.1 落地结构

| 文件 | 职责 |
| --- | --- |
| `views/deploy/DeployServersView.vue` | 子页宿主：`BaseDataTable` 六列表格、三态、增删改与连接测试编排 |
| `views/deploy/components/ServerFormDialog.vue` | 服务器表单弹窗（纯受控，props in / emits out） |
| `views/deploy/components/FileZillaImportDialog.vue` | FileZilla 导入弹窗 |
| `views/deploy/components/ServerRowActions.vue` | 行内三个操作的描边 SVG 图标组 |
| `views/deploy/composables/useDeployServers.ts` | 列表取数与删除 |
| `views/deploy/composables/useServerForm.ts` | 表单态、发布目录 tag 规则、掩码契约 |
| `views/deploy/composables/useFileZillaImport.ts` | 导入弹窗态与三态判定 |
| `views/deploy/deploy-servers.css` | 子页样式，`!important` 与硬编码颜色均为 0 |

D7 已落地为静态文本「密码」，提交固定 `authType: 'password'`。D6 随 Vue 实现自然消除——模板插值不经过 `escapeHtml`，实测弹窗正常打开。

### 8.2 契约保持情况

- **密码掩码**：编辑态密码框留空（掩码值不回填），空值不进提交体，单测覆盖 4 条。
- **发布目录 tag**：自动补首尾 `/`、重复给 1.2s 提示、空草稿 Backspace 弹出末项、双击就地编辑，全部保留并有单测。
- **`servers` 共享**：本子页增删改后回写 legacy 全局，构建/部署与项目配置弹窗仍读得到（E2E 已验 `window.servers.length === 3`）。
- **文档级 keydown 监听已消除**：改为元素级 `@keydown`，不再留全局监听。
- **子页激活**：新增 `devtools:legacy-subtab-activated` 桥接事件，`switchSubTab` 不再直接调 `loadServers`，Vue 侧按激活子页挂载。

### 8.3 架构合规调整

组件架构门禁是零基线，实现中触发两处 `native-control` 后已改正，非豁免：

- 发布目录 tag 的删除按钮 → 复用 `FilterChip` 的 `removable`。
- FileZilla 的 `<input type="file">` → 原生文件选择无公共组件等价物，改为按需创建游离元素触发系统选择框，模板内不留原生控件。

### 8.4 自动验证结果

`npm run lint`（含 CSS 基线、Token、架构门禁）全通过；`build:frontend` 通过；`test:unit` 262 项通过（新增 20 项：`useServerForm` 14、`useFileZillaImport` 6，另 `deploy-service` 补 4 项 filezilla 归一化）；子页 E2E 9 项通过，覆盖 1665×1184 与 900×600 × 亮暗、表单默认值与 tag 规则、编辑态密码为空、**D6 弹窗打开回归**、空态与失败态、legacy 弹窗共享数据，且断言全程零控制台错误（仅过滤既有 `defineSimpleMode` 噪声）。

### 8.5 首轮 Tauri 验收发现并修复（2026-08-07）

用户真机验收报「连接测试弹窗看不到任何输出」，但同一批服务器在部署弹窗里显示「全部连通 / 460ms」——连接是通的，只是日志没进弹窗。查出两层原因，都已修复：

**T1 Vue 侧取不到 legacy WS 全局（潜伏缺陷，影响面大于本子页）。** `src/js/websocket.js` 顶层用 `const WS = {...}`，在传统脚本里只创建**脚本作用域绑定，不会成为 `window` 属性**。而 Vue 侧是模块作用域、看不到裸标识符，`useDeployRealtime` / `useRunRealtime` 里的 `globalThis.WS` 恒为 `undefined`，于是 `ws.on(...)` 从未执行过——两个 composable 的 WS 订阅**一直是空转**。

浏览器实测佐证：`typeof window.WS === 'undefined'` 而 `eval('WS')` 得到 `object`。

本地运行页此前没暴露，是因为 `app.js` 里还留着 `run-log` / `run-status` 处理器兜底；部署面板的构建/部署也走 legacy 发起路径，故同样被掩盖。修复：在 `websocket.js` 末尾显式 `window.WS = WS`，并加注释说明迁移期两侧共用一条连接、WS 全量迁入 Vue 后可删。修复后实测 `run-status` / `run-log` 各 2 个处理器（legacy 一份 + Vue 一份，职责互补不重复），本地运行页 28 张卡片正常、零控制台错误。

**T2 连接测试未登记任务，消息被归属判据拒收。** WS 消息的归属判据是 `deploy-task` store 的 `active`（`acceptsMessage`）。原实现只开了 LogViewer、把 id 写在 `log-task` store 上，没有 `task.begin()`，导致 `active` 为 null、消息全部被拒。修复：`onTest` 先 `task.begin(server.name)` 再发请求，成功后 `task.attachTaskId(id)`，失败走 `task.abandon()` 本地解锁（否则卡片永久 busy）。

**T3 顺带消除一个并发隐患。** `useDeployRealtime` 原本每个调用方各注册一次 WS 处理器，而旧 `WS.on` 不去重；两个子页同时挂载会让同一条日志被追加多次。改为模块级单次注册 + 每调用方独立的完成回调集合；处理器注册后常驻（与迁移前 `app.js:setupWSHandlers` 全程常驻一致，也是弹窗最小化后后台任务仍能弹回提示的前提）。原「卸载时摘掉全部监听」的单测已按新契约改写为三条：多子页共用一份订阅不重复处理、卸载后处理器常驻仍能收到状态、卸载只摘自己的完成回调。

补充验证：单测 267 项通过（新增连接测试归属 3 条 + 实时链路 3 条）；子页 E2E 10 项通过，新增一条断言日志确实流入弹窗并校验处理器数量恒为 2。

### 8.6 PG5 清理结果（2026-08-07，用户 Tauri 验收通过后执行）

**清理范围比预估多一个文件。** 预估的 36 处集中在 `deploy.css` / `components.css` / `overrides.css`，实际检索发现 `legacy-runtime.css` 还有 6 处 `.tag-input-*` / `.tag-list` 规则（该文件此前未纳入统计）。四个文件全部清理后，仓库范围内 `.server-*` 与 `.path-tag` / `.tag-*` 选择器归零。

处理方式按选择器归属分两类：

- **独占规则**整块删除：`.server-card`、`.server-host`、`.server-list`、`.server-head`、`.server-header-fixed`、`.server-name`、`.server-actions`、`.path-tag` 及其子规则、`#page-deploy .server-row` 列宽定义等。
- **混合选择器组**只摘孤儿：`.history-row` / `.history-table` / `.stat-card` / `.modal` 等仍在用的选择器保持原位与原顺序，仅移除同组内的 `.server-*`。共 11 组。

同时把 `ServerRowActions.vue` 的根类名从全局 `.server-actions` 改为 `.deploy-servers__actions`：清理前 legacy 的 `.server-actions`（含 `display: inline-flex !important`）仍在泄漏到这个 Vue 组件上，改名后彻底解耦，也符合 BEM 约定。

`deploy.css` 由 643 行降至约 520 行，四个文件合计减少约 3.4 KB。

**Stylelint 基线调整（+2）。** 删除混合组里的选择器后，`overrides.css` 的 `.history-table` / `.history-row` 与 `deploy.css` 的 `.history-row` 从「带额外选择器的规则组」收缩成同名规则，被 Stylelint 判为重复（`overrides` 4→6、`deploy` 2→3，总计 26→28）。这与基线脚本注释里已记录的现象同源。

**选择不合并而是登记数量**，理由是这些重复项属顺序敏感的 `!important` 层叠：实测 `.history-table` 的 `border-radius` 由 6 条同权规则按源序决出最终值 8px，合并会改变层叠结果，属「零视觉收益 + 中高风险」，与既有 `modal.css` 不单独做的判断一致。等部署历史子页迁完，这批规则会整体消失。

**清理后回归**：`lint`（基线 28 项、Token、架构门禁）/ `build:frontend` / `test:unit` 267 项全通过；专项 E2E 5 项通过——部署历史子页亮暗主题下表头与数据行列宽完全一致（`94px 412.812px 78px 336.375px 305.797px 88px 72px`，对齐未破）、`border-radius` 仍为 8px、窄窗口「服务器」列仍正确隐藏、服务器子页不受影响、首页/本地运行/待办/笔记/设置/用量六页均正常渲染。

回归中出现的 `/api/notes/<date>` 404 与 `defineSimpleMode` 报错已在 HEAD 上对照确认同样存在（测试库无当天笔记的正常空数据分支 + CodeMirror 既有噪声），与本次清理无关。

### 8.7 仍留在 legacy 侧的部分

- `loadServers` 只保留取数，供构建/部署弹窗与项目默认配置弹窗读 `servers` 全局；等第 6 步弹窗迁完一并删除。
- `window.WS = WS` 是迁移期两侧共用一条连接的桥接，WS 全量迁入 Vue 后删除。
- `devtools:legacy-subtab-activated` 事件与 `switchSubTab`：三个子页全部迁完后一并收敛。
