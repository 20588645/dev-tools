# 组件架构合规专项

> 状态：规则与自动门禁、首批公共组件能力、通知适配层及首个消费者 Settings 已完成自动验收；Settings 已由用户通过网页前端连接正式 Sidecar 完成人工验收。其余存量页面收口与最终真实 Tauri Smoke Test 待执行。在本专项和全站回归完成前，不进入 Phase 6-2 Deploy
>
> 生效范围：`frontend/src/views/**` 及所有后续迁移业务页面。公共组件、适配层和第三方宿主的职责边界以本文为唯一专项入口；原执行计划中的一致规则继续有效，发生歧义时先暂停实现并更新本文。

## 1. 目标和非目标

本专项先建立不会随会话、工具或模型漂移的机械门禁，再进行已迁移页面二次优化。目标是让公共能力只有一个正式入口，让页面功能/视觉验收和组件架构验收彼此独立。

本阶段不重新设计页面、不改变已确认功能、不修复存量页面代码。现有违规只登记为递减基线，不视为合规，也不能作为新代码的参考实现。

## 2. 强制所有权边界

| 编号 | 必须遵守的规则 | 自动门禁 | 合法处理方式 |
| --- | --- | --- | --- |
| CA-01 | 业务 View、页面私有组件和 composable 禁止直接导入 `naive-ui`、`element-plus` 等第三方 UI 库 | 是，零基线 | 先进入项目 `Base*`、`components/vendor` 或 adapter 层 |
| CA-02 | 页面 CSS 禁止引用 `.n-*` 等第三方内部类 | 是，存量递减基线 | 扩展 Base 组件公开 prop、variant、slot 或 CSS variable |
| CA-03 | 普通业务页面禁止使用 `:deep()` 穿透组件内部结构 | 是，存量递减基线 | 受控第三方适配只能放在公共封装/adapter 层 |
| CA-04 | 页面不得重新实现原生 `button/input/select/textarea` 的外观和状态 | 是，存量递减基线 | 使用现有 Base 控件；无能力时先扩展公共契约 |
| CA-05 | 正式业务数据表格不得继续新增原生 `<table>` | 是，存量递减基线 | 先建立 `BaseDataTable`；纯语义小表经人工评审后登记例外 |
| CA-06 | View 禁止直接执行 `fetch`、Tauri IPC 或创建原始 WebSocket | 是，零基线 | 网络与 IPC 进入类型化 Service，实时连接进入共享基础设施 |
| CA-07 | 页面生命周期中的轮询优先使用项目 composable，不得继续新增裸 `setInterval` | 是，存量递减基线 | 使用或扩展 `useInterval`，明确启动、暂停和卸载语义 |
| CA-08 | 页面不得直接查询页面外 DOM；页面内焦点和元素控制优先使用 Vue ref | 是，存量递减基线 | 富文本 Selection/Range 等明确宿主能力经人工评审保留 |
| CA-09 | Base 能力不足时，必须先扩展公开 API，再同步清单、预览和测试，页面最后接入 | 人工 + 文件清单 | 禁止通过页面覆盖内部 DOM 临时绕过 |
| CA-10 | 第二个页面出现同一语义或交互模式时必须进行公共组件评审 | 人工 | 提升为公共组件，或记录因语义不同而保留私有的理由 |
| CA-11 | 页面功能/视觉验收和组件架构验收分开执行，两者都通过才允许关闭迁移 | 人工 Gate | 页面 `decision.md` 分别记录两类结论 |

## 3. 公共能力扩展顺序

发现现有 Base 组件无法满足页面时，固定执行：

1. 在本专项或页面 `assessment.md` 记录缺失能力和真实消费者。
2. 判断是页面私有语义、已有公共组件 variant，还是新的公共原语。
3. 先修改公共组件公开 props、events、slots、variant 或 CSS variable。
4. 同步 `shared-ui-inventory.md`、`UiFoundationPreview.vue`、类型和组件测试。
5. 公共能力单独验收通过后，页面才允许使用。

不得采用“页面先穿透 `.n-*`，以后再收口”的临时路线。

## 4. 原生元素和例外

以下内容不自动判为违规：普通布局容器、语义化 `article/section/nav`、Canvas/SVG、富文本可编辑宿主以及组件库明确要求的宿主元素。

`button/input/select/textarea/table`、第三方内部选择器、`:deep()`、裸定时器和直接 DOM 查询默认受门禁约束。确需例外时，必须在 `scripts/component-architecture-baseline.json` 的 `exceptions` 中登记规则、精确文件、数量和具体理由；“还原原型方便”“旧代码就是这样”“暂时绕过”不是合法理由。当前批准例外数为 0。

## 5. 自动门禁与递减基线

统一命令：

```bash
npm run lint:architecture
```

总 `npm run lint` 必须包含该命令。门禁按“规则 + 文件 + 数量”比较当前代码和基线：

- 新增违规：失败。
- 把违规转移到另一文件：失败。
- 已修复但未下调基线：失败，要求同步记录债务减少。
- 修改基线以增加容忍数量：必须先更新本文并取得用户确认。
- 例外缺少明确理由或数量：失败。

基线只是迁移期棘轮，不是永久白名单。专项完成条件是除人工批准例外外所有基线归零。

## 6. 2026-07-31 存量快照

当前业务页面直接导入第三方 UI、直接网络/IPC 调用均为 0。Settings 首个消费者收口后，待归零项由 68 个降至 64 个机器计数：

| 类型 | 数量 | 主要页面 |
| --- | ---: | --- |
| `.n-*` 第三方内部选择器 | 38 个 selector token（分布在 36 行） | Notes、Notebook、Todo、Usage、Run |
| `:deep()` | 2 | Run |
| 原生基础按钮 | 12 | Notebook 1、Notes 1、Run 1、Todo 4、Twofa 4、Usage 1 |
| 原生 `<table>` | 7 | Usage 6、Run 1 |
| 裸 `setInterval` | 4 | Usage 1、Twofa 3 |
| 直接 DOM 查询 | 1 | Home 1 |

无法可靠静态判断、必须人工验收的已知项：

- Twofa 重复 FilterChip、环形进度与折叠结构。
- Run、Todo、Twofa 的折叠模式是否统一。
- 页面是否遗漏已有公共组件，以及第二个相同模式是否已出现。

## 7. 页面架构验收清单

每个已迁移页面二次优化完成前必须逐项确认：

- [ ] 没有直接导入第三方 UI 库。
- [ ] 没有引用第三方内部类或在 View 使用 `:deep()`。
- [ ] 已遍历 `shared-ui-inventory.md`，可复用组件均已使用。
- [ ] 新增原生交互元素和数据表格均为 0，或存在已批准例外。
- [ ] Base 能力扩展已经先于页面接入完成，并同步清单、预览和测试。
- [ ] Timer、Observer、事件监听和页面可见性资源均由 composable 管理并在卸载时清理。
- [ ] 第二处相同交互模式已完成公共组件评审。
- [ ] 功能/视觉验收与本清单分别记录结论。
- [ ] `npm run lint`、类型检查、单测和页面行为测试通过。

## 8. 专项执行顺序

```text
规则与自动门禁
→ 公共组件能力补齐
→ 已迁移页面逐页收口
→ Run 体验优化与真实 Tauri E2E
→ 全站自动回归与 Tauri Smoke Test
→ Phase 6-2 Deploy
```

页面收口不重新设计已确认页面。若优化需要改变布局、交互或功能，必须回到对应页面 PG2/PG3，由用户确认后再实施。

## 9. 规则与自动门禁实施记录（2026-07-31）

本专项第一子项已完成：

- 建立本文作为组件架构合规专项唯一入口。
- 建立 `component-architecture-baseline.json`，采用精确到规则与文件的递减基线，当前 68 项、批准例外 0 项。
- 建立 `validate-component-architecture.mjs`，覆盖 CA-01～CA-08 中可静态判断的内容。
- ESLint 对业务页面直接导入第三方 UI 库提供即时错误。
- `npm run lint` 已串联 JavaScript、CSS、Token 和组件架构四类门禁。
- `npm test` 已包含架构门禁脚本的独立测试。

自动验证：`npm run lint`、`npm test`（原有 181 项 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、`git diff --check` 全部通过。

手动 E2E：**不需要**。本子项只修改规范、检查配置和开发脚本，没有改变应用运行时代码、页面结构、公共组件或用户交互。

该记录中的下一子项已经按第 10 节完成；仍坚持公共能力先验收、业务页面后接入的顺序。

## 10. 首批公共组件能力补齐记录（2026-07-31）

已完成以下项目自有契约，当前尚未修改业务消费者，因此 68 项递减基线保持不变：

| 能力 | 项目 API | 已确认消费者 |
| --- | --- | --- |
| `BaseDataTable` | rows、columns、rowKey、density、loading、滚动与空状态 | Usage 正式数据表、Run 历史表 |
| `BaseDisclosure` | 受控 v-model、header/actions slot、三种 variant | Settings、Todo、Twofa、Run 折叠模式 |
| `BaseSideNav` | 项目 items/value/caption 契约，内部使用 NMenu | Settings 分类导航 |
| `BaseProgress circle` | shape、size、strokeWidth、indicator slot | Twofa 倒计时环 |
| `BaseCard` 布局 | contentLayout、contentOverflow、fillHeight | Notes、Notebook、Todo、Usage、Run 卡片内部布局 |
| `BaseInput/BaseTextarea` 编辑变体 | plain/title/editor、autosize、fillHeight、resize | Notes 标题与正文、Notebook/Todo 编辑区域 |

所有新增能力均已进入 `UiFoundationPreview.vue`，组件 smoke test 覆盖表格渲染、折叠事件、侧边导航事件、环形进度和布局变体。

内置浏览器已验证亮色、暗色与 900×600：新增区域无横向溢出，表格、环形进度和侧边导航显示正常；折叠触发器实测为原生语义按钮，具备 `aria-expanded`/`aria-controls`，展开与收起状态一致。控制台仅有迁移前已知的 CodeMirror `defineSimpleMode` 错误，没有新增组件错误。

真实 Tauri 手动 E2E：**必须，待合并执行**。本批能力尚未接入业务消费者，为避免重复验证，将在通知适配层和首个页面消费者接入完成后统一检查 UI Foundation 与代表性页面；在收到用户通过确认前不关闭公共组件专项 Gate。

本批不包含通知宿主迁移；该独立子项已经按第 11 节完成。

## 11. 通知适配层实施记录（2026-07-31）

全站业务调用继续使用 `useNotificationStore().push/remove/clear`，没有页面直接依赖 Naive UI。反馈宿主的所有权已收敛如下：

- `AppToastHost` 只负责订阅 notification Store 与保留 `aria-live` 播报，不再绘制 Toast、关闭按钮或创建定时器。
- `adapters/notification-message.ts` 将 info/success/warning/error、duration 和离场生命周期映射到 Naive Message。
- `UiLibraryProvider` 统一提供右下角 Message 宿主、手动关闭和悬停保留；Store 的 remove/clear 会销毁可见 Message，Message 自动离场或手动关闭后会清理 Store。
- `duration <= 0` 保持为持久通知；宿主卸载只清理 UI handle，不反向删除 Store 状态。
- Naive Notification Provider 继续保留给未来含标题、描述或操作区的富通知；未建立项目契约前业务代码不得直接使用。

UI Foundation 的“反馈状态”已经增加 success、warning、error 和持久通知入口。单元测试覆盖 tone/时长映射、离场清理、Store remove/clear、宿主卸载，并通过实际 Provider smoke test 确认页面不再生成旧 `.toast` DOM。

自动验证全部通过：`npm run lint`、`npm test`（单元测试 188 项 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、`git diff --check`。架构递减基线仍为 68 项、批准例外 0 项。

内置浏览器已验证 success/warning/error/info 类型、4 秒自动消失、持久通知手动关闭、亮暗主题和 900×600；窄窗口 `documentWidth = viewportWidth = 900`，通知矩形完整位于视口内。控制台仅有迁移前已知的 CodeMirror `defineSimpleMode` 错误，没有新增通知或 Provider 错误。

真实 Tauri 手动 E2E：**必须，合并到专项最终 Tauri Smoke Test**；范围包括四种通知、自动消失、手动关闭、持久通知及 Tauri 壳内代表性操作反馈。用户当前有本地运行任务，为避免重启软件中断进程，本子项不单独要求立即重启。

## 12. 首个业务消费者 Settings 收口记录（2026-07-31）

本子项不改变 Settings 已确认的信息架构、业务功能和数据契约，只替换重复的基础实现：

- 六分类导航由页面手写按钮改为 `BaseSideNav`；公共组件新增 vertical/horizontal/responsive、compact 和响应式断点契约。宽屏仍为垂直导航，1050px 以下使用 Naive `NMenu` 横向 menubar，横向默认隐藏编号以保证分类全名可见。
- “实验功能”由页面手写折叠按钮改为 `BaseDisclosure`；公共组件新增 header/content padding 与最小标题高度公开 API，Settings 保持原 42px 标题行，不穿透组件内部样式。
- 搜索结果行由原生按钮改为 `BaseButton`，三列内容布局留在页面私有结构中。
- 搜索跳转焦点不再使用 `document.querySelector`；`SettingsView` 通过 Vue ref 限定在自己的内容容器内查找固定 `data-setting-id`。
- 首轮真实 Tauri 验收后的视觉缺陷继续在公共组件层收口：`BaseSideNav` 的垂直选中态覆盖编号与标题完整内容行，并统一保留 8px 内容缩进；`BaseInput` 新增可复用的 search 变体，Settings 搜索使用明确输入表面、示例占位文案及 `⌘/Ctrl + K` 聚焦，不在页面穿透 Naive 内部样式。

架构基线减少 4 项：Settings 原生控件 3 → 0、`document.querySelector` 1 → 0；总基线 68 → 64，批准例外仍为 0。组件 smoke test 已覆盖横向导航、整行选中态结构、Search 变体和 Disclosure 公开尺寸 API；Settings E2E 6 项全部通过。

全量自动验证通过：`npm run lint`、`npm test`（单元测试 188 项 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、`git diff --check`；生产构建仅保留迁移前既有 legacy script/CSS 警告。

内置浏览器使用隔离测试 Sidecar `DEVTOOLS_TEST=1` / `13900` / `data-test` 验证：1280×720 垂直导航、900×600 横向完整分类名、六分类语义、实验功能展开/收起、搜索“备份”后跳转与焦点、页面无横向溢出。启动测试 Sidecar 时显式使用与 `better-sqlite3` ABI 匹配的 Node 18.20.4；未连接正式 13456/data。截图与 Playwright 最后运行记录均未保留在仓库。

人工 E2E：**已通过**。2026-07-31 用户使用 `http://127.0.0.1:1420/?apiPort=13456` 连接正式 Sidecar，确认垂直导航整行选中态、8px 内容缩进、设置搜索与“备份 → 数据与备份”跳转均无问题。该结果是正式数据链路上的网页人工验收，不冒充 Tauri 壳验收；通知和壳能力仍按第 11 节合并到专项最终 Tauri Smoke Test。Settings 首个消费者 Gate 已关闭，可以继续存量页面收口。
