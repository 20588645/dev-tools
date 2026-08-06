# 部署面板页面迁移决策

> 状态：**PG3 已通过（2026-08-06，用户确认采纳推荐方向）**，PG4 实现进行中
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
