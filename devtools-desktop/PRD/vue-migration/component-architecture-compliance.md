# 组件架构合规专项

> 状态：规则与自动门禁、公共组件能力、通知适配层及全部九个已迁移页面的组件架构自动收口已完成，机器基线与批准例外均为 0；Run 的用户体验确认、真实 Tauri E2E 与专项最终 Tauri Smoke Test 尚未完成。在这些 Gate 关闭前，不进入 Phase 6-2 Deploy
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

## 6. 2026-08-03 当前存量快照

当前业务页面直接导入第三方 UI、引用第三方内部类、使用 `:deep()`、重复原生交互/正式表格、直接网络/IPC、直接 DOM 查询和裸 `setInterval` 的机器基线均为 0。九个已迁移页面完成逐页收口后，待归零项由 68 个降至 0：

| 类型 | 数量 | 主要页面 |
| --- | ---: | --- |
| `.n-*` 第三方内部选择器 | 0 | Run 已归零 |
| `:deep()` | 0 | Run 已归零 |
| 原生基础按钮 | 0 | Run 已归零 |
| 原生 `<table>` | 0 | Run 已归零 |
| 裸 `setInterval` | 0 | Twofa、Usage 已归零 |
| 直接 DOM 查询 | 0 | Home 已归零 |

无法可靠静态判断、必须人工验收的已知项：

- Run 的真实进程状态、折叠/表格视觉与用户此前“不太好用”反馈是否在真实 Tauri 中关闭。
- 后续新页面是否遗漏已有公共组件，以及第二个相同模式是否已出现。

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
| `BaseDisclosure` | 受控 v-model、header/actions slot、三种 variant、content gap | Settings、Todo、Twofa、Run 折叠模式 |
| `BaseSideNav` | 项目 items/value/caption 契约，内部使用 NMenu | Settings 分类导航 |
| `BaseProgress circle` | shape、size、strokeWidth、indicator slot | Twofa 倒计时环 |
| `BaseCard` 布局 | contentLayout、contentOverflow、fillHeight | Notes、Notebook、Todo、Usage、Run 卡片内部布局 |
| `BaseEntityCard` | icon/title/subtitle/badge/meta/body/status/actions/details、default/compact、受控详情与 ARIA | Twofa 账号卡；Deploy 项目卡待 Phase 6-2 接入 |
| `BaseInput/BaseTextarea` 编辑变体 | plain/title/editor、autosize、fillHeight、resize | Notes 标题与正文、Notebook/Todo 编辑区域 |

所有新增能力均已进入 `UiFoundationPreview.vue`，组件 smoke test 覆盖表格渲染、折叠事件、侧边导航事件、环形进度、结构化实体卡片和布局变体。

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

## 13. Home 页面架构收口记录（2026-07-31）

Home 人工审计未发现遗漏的公共组件：页面操作均使用 `BaseButton`，外壳使用 `PageFrame`；没有第三方内部选择器、原生交互控件、原生表格、裸定时器或直接网络调用。

唯一机器债务是 `useHomeDashboard` 启动时查询 `#page-home.active`。现改为由 `MigrationHost` 将其权威 `activePage` 作为响应式 prop/ref 传入，composable 通过 `watch` 保留重新进入首页时刷新数据的行为，不再重复订阅 legacy 激活事件或查询页面 DOM。架构基线由 64 降至 63，直接 DOM 查询归零。

## 14. IpCheck 页面架构收口记录（2026-07-31）

IpCheck 人工审计确认查询、状态、卡片、普通进度和页面骨架均已使用现有项目公共组件；没有第三方内部选择器、原生交互控件、原生表格、直接网络调用、直接 DOM 查询或裸 `setInterval`。风险摘要的分段渐变刻度具有页面专属阈值和 `role="meter"` 语义，保留为页面私有风险可视化，不错误替换为普通 `BaseProgress`。

“复制详情”原先单独维护局部提示状态、2 秒清理定时器和固定定位 Toast 样式，与第 11 节统一通知能力重复。现改为调用 `useNotificationStore`，成功与权限错误均由 Naive Message 适配层呈现；页面内提示 DOM、样式和定时器已删除。Playwright 覆盖复制内容、成功 Message 与失败 Message。该项属于人工识别的重复实现收口，机器递减基线保持 63，批准例外仍为 0。

完整自动回归通过：`npm run lint`、`npm test`（单元测试 188 项 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、`git diff --check`；IpCheck Playwright 4 项单独通过。正式 Sidecar 网页人工验收确认当前 IP 结果与复制成功 Message 正常，未执行正式数据写入；真实 Tauri 通知验收仍合并到专项最终 Smoke Test。

## 15. Notes 页面架构收口记录（2026-07-31）

Notes 的机器债务包括 1 个日期列表原生按钮和 20 个 Naive 内部选择器。人工复核确认页面的周次、反馈、Git 活动、选择框和操作按钮均已正确使用项目组件；需要收口的是日期选择项、卡片填充布局与标题/正文编辑器样式所有权。

- Notes、Notebook 与 Todo 已出现相同的可选择列表项模式，因此先建立 `BaseSelectableItem`，统一 selected、pressed、disabled、焦点、悬停和选择态；Notes 日期列表只保留日期内容与响应式栅格布局。
- 周列表与编辑卡接入 `BaseCard` 的 fillHeight、contentLayout、contentOverflow 和 contentBackground 公开契约，不再查询或覆盖 `.n-card-content`。
- 标题和正文接入 `BaseInput title`、`BaseTextarea editor/fillHeight` 与 eyebrow label 公开契约；公共层补齐紧凑窗口尺寸和无消息时的两行填充轨道，页面不再覆盖 `.n-input*`。
- Git 活动目标日期使用页面自有说明布局包裹 `BaseSelect`，不再通过 `.n-select` 调整第三方根节点。

Notes 的 21 项机器债务全部归零：第三方内部选择器 20 → 0、原生控件 1 → 0；专项总基线 63 → 42，批准例外仍为 0。组件 smoke test 已覆盖选择项语义、卡片背景和编辑器公开变体；Notes Playwright 5 项覆盖自动保存、切日 flush、错误重试、跨页状态和 900×600 几何回归并全部通过。

完整自动回归通过：`npm run lint`、`npm test`（35 个测试文件 / 189 项单元与组件测试 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、`git diff --check`；生产构建仅保留迁移前既有 legacy script/CSS 提示。

正式 Sidecar 网页只读验收使用 `http://127.0.0.1:1420/?apiPort=13456`，确认五个工作日读取、当前日期 `aria-pressed` 选中态、周列表与编辑区填充布局、当前窗口及 900×600 紧凑布局均正常，页面无横向溢出；未编辑正式工时内容，未打开 Git 活动参考，也未执行任何写入。控制台仅有迁移前已知的 CodeMirror `defineSimpleMode` 错误，没有新增 Notes 或公共组件错误。该结果不替代专项最终真实 Tauri Smoke Test。

## 16. Notebook 页面架构收口记录（2026-07-31）

Notebook 的机器债务包括 1 个笔记列表原生按钮和 5 个 Naive 内部选择器。人工复核确认页面头部、搜索、筛选、排序、编辑操作、状态、弹窗和富文本宿主已有明确的项目组件或页面私有语义；本轮只收口笔记列表选择、卡片填充布局和标题输入样式所有权。

- 笔记列表接入 `BaseSelectableItem`，使用 `role="option"` / `aria-selected` 保留 listbox 语义；手动排序按钮从列表选择按钮内部移为同级操作，消除按钮嵌套，同时保持原位置和移动能力。
- 列表卡与编辑卡接入 `BaseCard` 的 fillHeight、contentLayout 和 contentOverflow 公开契约，页面不再覆盖 `.n-card-content`。
- 标题接入 `BaseInput title` 与 eyebrow label，搜索接入 search 变体，页面不再覆盖 `.n-input` 或 `.field-control*` 内部结构。
- 富文本 `contenteditable`、凭据表和普通语义表格仍是页面专属编辑器宿主，不属于 CA-04/CA-05 的平行业务控件实现，不错误替换为 BaseTextarea 或 BaseDataTable。

Notebook 的 6 项机器债务全部归零：第三方内部选择器 5 → 0、原生控件 1 → 0；专项总基线 42 → 36，批准例外仍为 0。Notebook Playwright 7 项全部通过，覆盖亮暗主题、900×600、自动保存与 flush、HTML 清洗、凭据表、显式链接和插入位置；新增断言确认列表 option 数量、唯一选中态与列表按钮内部没有嵌套交互控件。统一通知上线后两处旧文本断言已收窄到 Message 宿主，没有改变业务行为。

完整自动回归通过：`npm run lint`、`npm test`（35 个测试文件 / 189 项单元与组件测试 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、`git diff --check`；生产构建仅保留迁移前既有 legacy script/CSS 提示。

正式 Sidecar 网页只读验收使用 `http://127.0.0.1:1420/?apiPort=13456`，当前窗口下 5 条笔记均以 option 呈现、唯一选中、编辑区完整铺满；900×600 下正文可编辑区约 380×202px，页面和文档均无横向溢出，列表项内部交互控件为 0。验收未搜索、新建、编辑、打开菜单或复制内容，也未执行任何写入；控制台仅有迁移前已知的 CodeMirror `defineSimpleMode` 错误。该结果不替代专项最终真实 Tauri Smoke Test。

## 17. Todo 页面架构收口记录（2026-08-03）

Todo 的机器债务包括 4 个原生按钮和 9 个 Naive 内部选择器。人工复核确认搜索、筛选、任务创建、状态切换、确认、日期选择和普通操作已经使用项目组件；需要收口的是三状态分组折叠、任务行选择、保存重试、空清单入口、卡片填充布局和表单内部样式所有权。

- `BaseSelectableItem` 增加 card/row 外观，Todo 任务行使用 row、selected/pressed 契约；任务标题、摘要、进度与日期仍由页面负责。
- 三状态分组接入 `BaseDisclosure plain`，通过公开 header/content padding 与最小高度保持原密度，展开语义由公共组件统一提供。
- `BaseInput` 增加 strong/completed 文本态，`BaseTextarea` 增加 relaxed 正文态，`BaseCheckbox` 增加隐藏视觉标签但保留可访问名称的公开契约；能力已同步组件预览、smoke test 与共享清单。
- 列表卡与详情卡接入 `BaseCard` 的 fillHeight、contentLayout 和 contentOverflow；保存失败重试与空清单入口改用 `BaseButton`。页面不再覆盖 `.n-*`、`.field-control*`、`.choice-control*` 或 PageFrame 内部结构。

Todo 的 13 项机器债务全部归零：第三方内部选择器 9 → 0、原生控件 4 → 0；专项总基线 36 → 23，批准例外仍为 0。Todo Playwright 4 项全部通过，覆盖亮暗主题、900×600 主从布局、搜索/筛选/创建、自动保存、清单、完成确认和批量清理；新增断言确认三组折叠状态、唯一任务选中态、任务行内部没有嵌套交互控件，以及空清单入口可添加首项。

完整自动回归通过：`npm run lint`、`npm test`（35 个测试文件 / 189 项单元与组件测试 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、`git diff --check`；生产构建仅保留迁移前既有 legacy script/CSS 提示。

正式 Sidecar 网页只读验收使用 `http://127.0.0.1:1420/?apiPort=13456`。1280×720 下 3 个分组、2 条任务、唯一选中态和双栏布局正常；900×600 自动切为 692px 宽列表主视图，页面与文档均无横向溢出，任务行内部交互控件为 0。验收未搜索、新建、选择、编辑、勾选、折叠或执行写入；控制台仅有迁移前已知的 CodeMirror `defineSimpleMode` 错误。该结果不替代专项最终真实 Tauri Smoke Test。

## 18. Twofa 页面架构收口记录（2026-08-03）

Twofa 的机器债务包括 4 个原生按钮和 3 个裸 `setInterval`。人工复核还确认分组筛选、分组/账号折叠与圆形倒计时已经有项目公共契约，但页面仍保留平行实现；账号行使用 `role="button"` 包裹复制按钮，存在嵌套交互语义冲突。

- 工具栏分组与账号弹窗的分组建议接入 `FilterChip`；公共组件补齐 `ariaLabel`、button role 与 `aria-pressed`，统一数量、选中态及键盘语义。
- 分组接入 `BaseDisclosure plain`；账号详情最初接入公共折叠能力，后续真实 Tauri 视觉回归按第 21 节提升为 `BaseEntityCard`。复制操作与详情触发器保持同级，页面不再维护嵌套交互结构。
- 账号行与常用卡片的手写 SVG 环改用 `BaseProgress circle`；常用卡片接入 `BaseSelectableItem`。验证码、发行方、标签和响应式排布仍由 Twofa 页面负责。
- `useInterval` 增加 `autoStart` 生命周期契约，快捷查询仅在已有查询结果时手动启动；页面轮询和倒计时统一由 composable 负责暂停、恢复与卸载清理。
- `PageFrame` 改用已有 immersive 变体，搜索接入 search 变体，不再覆盖 PageFrame 内部结构或维护重复输入表面。

Twofa 的 7 项机器债务全部归零：原生控件 4 → 0、裸定时器 3 → 0；专项总基线 23 → 16，批准例外仍为 0。Twofa Playwright 11 项全部通过，新增覆盖圆形公共进度、FilterChip 选中语义、三组公共折叠、折叠后可见状态、账号行无嵌套交互控件和详情零额外间距。

完整自动回归通过：`npm run lint`、`npm test`（36 个测试文件 / 190 项单元与组件测试 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、`git diff --check`；生产构建仅保留迁移前既有 legacy script/CSS 提示。

正式 Sidecar 网页只读验收使用 `http://127.0.0.1:1420/?apiPort=13456`。1280×720 下 3 组、4 个账号、4 个可见圆形倒计时、唯一筛选态和全部展开分组正常；900×600 下按既定设计隐藏行内倒计时环，4 行账号均无截断。两个尺寸的页面、文档与 View 均无横向溢出，折叠触发器内部交互控件为 0。验收未搜索、复制、编辑、收藏、删除、导入或执行任何后端写入；该结果不替代专项最终真实 Tauri Smoke Test。

## 19. Usage 页面架构收口记录（2026-08-03）

Usage 的 10 项机器债务包括 1 个原生按钮、6 个原生表格节点、2 个 Naive 内部选择器和 1 个裸 `setInterval`。其中 5 个是正式业务数据表格，另 1 个是趋势悬浮指标矩阵；人工复核还发现页面直接覆盖 PageFrame 内部结构和表单内部 `.field-control`。

- 项目排名、高用量请求、模型统计、请求日志和模型单价五类正式业务表格统一接入 `BaseDataTable`；页面只维护类型化 columns、rows 和单元格业务呈现，不再依赖 Naive UI 类型或内部 DOM。
- 趋势悬浮详情属于瞬时小型指标矩阵，保留页面私有语义网格并使用 `table/row/rowheader/cell` ARIA，不误用正式数据表格组件。
- 自动刷新改由 `useInterval` 承担启动、暂停、重新进入页面和卸载清理；原有关闭 / 10s / 30s / 60s 业务语义保持不变。
- 总览区域使用 `BaseCard` 的公开内容布局与 overflow 契约，PageFrame 改用已有 immersive 变体；模型筛选、订阅费用和单价输入只通过 Base 组件根节点公开 class 定制页面布局，不穿透内部结构。
- “查看价格设置”改用 `BaseButton`，价格、扫描、订阅与历史重算契约均未改变。

Usage 的 10 项机器债务全部归零：原生按钮 1 → 0、原生表格 6 → 0、第三方内部选择器 2 → 0、裸定时器 1 → 0；专项总基线 16 → 6，批准例外仍为 0。Usage Playwright 6 项全部通过，并补充断言确认项目排名、高用量请求、模型统计、请求日志和模型单价均使用公共数据表格区域。

完整自动回归通过：`npm run lint`、`npm test`（36 个测试文件 / 190 项单元与组件测试 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、`git diff --check`；生产构建仅保留迁移前既有 legacy script/CSS 提示。

正式 Sidecar 网页验收使用 `http://127.0.0.1:1420/?apiPort=13456`。1280×720 和 900×600 下项目排名、高用量请求与模型统计三个公共数据表区域均正常存在，页面与文档无横向溢出。验收只执行正常页面加载和布局检查，未点击重新扫描、价格同步、保存或导入；但 Usage 的普通 GET 查询可能触发节流增量扫描并更新正式用量库或扫描游标，因此该验收不声明为严格只读，也不替代专项最终真实 Tauri Smoke Test。

## 20. Run 页面组件架构收口记录（2026-08-03）

Run 是专项最后一个存量页面，剩余 6 项机器债务包括 2 个 Naive 内部选择器、2 个 `:deep()`、1 个分组原生按钮和 1 个运行历史原生表格。人工复核确认实时状态、进程操作、端口释放、配置表单、日志弹窗和定时器已经有明确的 Store、Service、公共组件及 composable 所有权，本轮不改这些高风险业务契约。

- 三张统计卡与项目卡使用 `BaseCard contentLayout/fillHeight`，页面不再穿透 `.n-card__content`。
- 项目分组接入 `BaseDisclosure card`，复合标题、运行中状态和上移/下移/重命名 actions 保持原位置；展开状态、键盘和 ARIA 由公共组件统一负责。
- 运行历史接入 `BaseDataTable`，保留最近 100 条、三档状态、模块字段、单条删除和清空确认；表格横向滚动收在组件内部。
- 正式 Sidecar 只读接口取证发现同一项目会同时返回旧 `stopped` 与当前 `running` 记录，新增 E2E 断言确认旧记录不会抬高“运行中”统计，统计值与运行项目卡保持一致。

Run 的 6 项机器债务全部归零，专项总基线 6 → 0，批准例外仍为 0。最新完整自动回归通过：`npm run lint`、`npm test`（36 个测试文件 / 191 项单元与组件测试 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、`git diff --check`；Run Playwright 13/13 通过，覆盖分组公共折叠、历史公共表格、宽窄窗口、亮暗主题和统计/卡片一致性。

本轮没有把架构收口扩大为未经 PG2/PG3 确认的弹窗或页面重设计。正式 Sidecar 只读接口确认当前 10 个项目，状态接口包含同一项目的 1 条旧 stopped 与 1 条当前 running 记录；未调用任何启动、停止、重启、批量停止、打开地址、删除历史或强释端口接口。内置浏览器重新接管本地标签页被当前安全策略阻止，因此不虚构正式网页视觉验收；Run 的用户体验确认与真实 Tauri 第 10 节清单仍是独立未关闭 Gate。

## 21. 专项跨页真实 Tauri 回归记录（2026-08-03）

用户在真实软件中完成本轮已优化页面的第一轮跨页验收：S1 首页、S2 设置、S3 纯净检测、S4 工时内容、S5 个人笔记、S6 待办事项和 S8 用量统计均通过。S7 双因验证功能可用，但宽窗口账号卡片横向铺满、验证码区与身份区过度分离、展开详情松散，视觉验收未通过。

S7 首轮双列长条方案仍未达到用户给出的 Deploy 卡片参考。复核确认 Twofa 账号与旧 Deploy 项目都属于“图标、标题、副标题、徽标、主体、状态、操作、可展开详情”的结构化实体卡片语义，但项目此前只有通用 `BaseCard` 外壳；旧 Deploy `.project-card` 仍是 `deploy.js + deploy.css` 的 legacy 手写实现，并非可供 Vue 页面复用的公共组件。

按公共能力先行规则新增 `BaseEntityCard`：内部复用 `BaseCard` 和项目按钮，统一 icon/title/subtitle/badge/meta/body/status/actions/details、default/compact、受控详情、焦点与 ARIA 契约；组件预览和 smoke test 先通过后，Twofa 才接入。账号列表现在按宽/中/窄窗口使用 3/2/1 列实体卡片，验证码与倒计时成为卡片主体，周期状态和详情/复制进入稳定底部区域。`BaseDisclosure` 同步修正标题区与附加操作的 flex 收缩契约，避免右侧按钮被裁切。旧 Deploy 页面本轮不改，Phase 6-2 Vue 迁移时直接消费公共卡片。

定向组件 smoke test 12/12 与 Twofa Playwright 12/12 通过；新增 1600×900 E2E 覆盖三列实体卡片、公共组件接入和横向溢出，并保留 900×600、亮暗主题、筛选、详情、复制、编辑/收藏/删除确认、快捷查询和导入覆盖。完整回归通过 `npm run lint`、`npm test`（36 个测试文件 / 191 项测试，另含架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、Run + Twofa Playwright 25/25 与 `git diff --check`。S7 仍需用户在真实 Tauri 中复测；Run 的独立体验与真实进程 E2E 仍按既定顺序待执行，因此本记录不是专项最终 Smoke Test 通过结论。

## 22. Twofa 卡片与分组标题视觉收口记录（2026-08-05）

第 21 节的 `BaseEntityCard` 接入解决了长条铺满问题，但用户在真实软件复测后指出卡片本体与分组标题的样式仍不够精致。本轮先用静态 HTML 原型呈现完整页面效果（同一页内切换卡片风格、分组标题风格、明暗主题与宽/中/窄列数），由用户在真实视觉下选定「卡片 C 细线进度 + 分组标题 2 eyebrow」，再按 CA-09 顺序落到公共组件。

诊断出三处具体问题：账号卡片被分隔线切成四段，其中「30 秒周期 · 本机生成」是满宽带边框浅底长条，视觉最重而信息量最低，形成框中框；验证码与倒计时环被 `space-between` 推到两端，中间留出大片空白；分组标题是 11px 灰字加 mono 小数字、箭头贴容器左边，标题与下方卡片没有归属关系。

公共组件先行扩展，页面最后接入：

- `BaseEntityCard` 新增 `statusPlacement`，`footer` 把低信息量状态文案降级为底部说明位，卡片结构从四段收敛到两段；同一状态插槽只渲染一次，底部状态存在时详情与操作收进右侧控制组。
- `BaseEntityCard` 新增 `bodyAlign`，`stretch` 支持「验证码 + 进度线」这类多行纵向主体自行铺满宽度。
- `BaseEntityCard` 新增 `headerExtra` 插槽承载标签等头部尾随内容，标签不再参与标题省略号计算。
- `BaseEntityCard` 去掉 `min-height` 硬编码，卡片高度由内容决定；补 hover 抬升；compact 只压缩纵向节奏，左右内边距与 default 统一为 16px，同一网格里的卡片保持对齐基线。
- `BaseProgress` 新增 `rail` 轨道对比度契约。1~2px 细线在 `--color-surface-subtle`（4% 透明度）轨道上几乎看不见，会被误读成线断了，`visible` 改用 `--color-border`。

Twofa 页面接入：账号卡片的圆环倒计时改为 `BaseProgress shape="line" rail="visible"`，剩余秒数以文字形式紧跟验证码，卡片内不再有纯装饰圆形；常用卡片保留圆环。头像去掉外边框只留极淡底，尺寸 38→34px，常用卡片头像独立收窄到 30px。分组标题按 eyebrow 处理，数量用 mono 小字，`::after` 延伸一条细线划开分组区间，组间 `space-5` 大于组内 `space-3` 形成「紧内松外」。分组网格改用 `align-items: start`，避免展开单张卡片时把同排未展开的卡片拉高留出空白。

公共组件与页面所有定制均通过公开 props、插槽与根节点 class 完成，页面 CSS 不写公共组件的内部 BEM 类，也没有新增 `.n-*` 或 `:deep()`。

组件 smoke test 新增底部状态与 stretch 主体契约断言，共 13/14 项通过；Twofa Playwright 从 12 项扩到 14 项，新增断言覆盖「状态不在带框面板内」「进度线宽度等于卡片内容宽度」「展开单张卡片不拉伸同排卡片」，并把 `openTwofa` 的倒计时断言改为账号卡片 5 条线形加常用卡片 2 个圆环。

完整自动回归通过：`npm run lint`、`npm test`（36 个测试文件 / 192 项单元与组件测试 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、Run + Twofa Playwright 25/25（新增 2 项后为 27 项）。组件架构基线仍为 0，批准例外 0。

本轮视觉验收使用 Playwright 在 1600×950、1280×800、900×600 三个尺寸抓取亮暗主题与展开态截图自查，确认进度线贯通、底部状态无边框、暗色和谐、窄窗口单列无横向溢出；截图为临时产物已删除，未提交仓库。S7 仍需用户在真实 Tauri 中复测确认，Run 的独立体验与真实进程 E2E 仍按既定顺序待执行，本记录不是专项最终 Smoke Test 通过结论。

## 23. Twofa 详情箭头与倒计时动画细节修复（2026-08-05）

用户在真实软件确认第 22 节的卡片与分组标题效果全部通过，同时指出两处细节：详情按钮的箭头在折叠态偏下、展开后才回到居中；进度线按秒闪烁而不是线性推进。两处根因都在公共组件，不在页面。

- 箭头原本用 `›` 文字字符。字形自带基线偏移使图标视觉偏下，且旋转后外接盒随之变化，折叠与展开两个状态无法对齐。改为 12×12 定尺 inline SVG，`flex: 0 0 auto` 固定盒子；实测两个状态的边界盒均为 12×12、与按钮垂直中心偏移 0。
- 组件库对进度填充使用 `max-width .2s var(--n-bezier)`。倒计时每秒 tick 一次，填充会在 200ms 内急冲 1/30 再静止 800ms，观感即为闪烁。`BaseProgress` 新增 `tickInterval` 公开契约：传入 value 的更新间隔后，填充过渡拉长到整个节拍并改为 `linear`，线形与环形同时适用，并在 `prefers-reduced-motion` 下退化。
- 该覆盖属于受控第三方适配，按 CA-03 只允许放在公共封装层。组件库的过渡规则是五层选择器，`:deep()` 必须匹配同样深度才能提权；重复类名的写法权重不足，已改为完整层级链。实测线形为 `max-width 1s linear`、环形为 `stroke-dasharray 1s linear`。

Twofa 账号卡片的细线与常用卡片的圆环均传入 `tickInterval=1000`，与 `useTwofa` 里 1 秒的 tick 定时器一致。公共能力已同步共享清单、组件预览与 smoke test；新增断言覆盖 ticking class、CSS 变量注入以及箭头必须是 SVG 元素。

完整自动回归通过：`npm run lint`、`npm test`（36 个测试文件 / 193 项单元与组件测试 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、Run + Twofa Playwright 27/27。组件架构基线仍为 0，批准例外 0。第 22 节的四项视觉结论与本节两项细节均已由用户在真实 Tauri 中确认，S7 双因验证视觉验收至此关闭；Run 的独立体验与真实进程 E2E 仍按既定顺序待执行。
