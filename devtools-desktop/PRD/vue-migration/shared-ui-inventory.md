# 共享 UI 现状盘点

> 状态：Phase 2-D 预览验收已完成；Naive UI 作为底层实现，项目 Base 组件作为业务唯一入口。2026-07-31 起组件所有权受[组件架构合规专项](./component-architecture-compliance.md)与 `npm run lint:architecture` 共同约束。

## 首批基础组件

| 组件 | 使用语义 | 首批状态 | 约束 |
| --- | --- | --- | --- |
| `PageFrame` / `PageBody` | 页面外壳与滚动区域 | 已实现 | 页面顶部不参与正文滚动，支持 standard / immersive / workspace |
| `PageTop` / `PageHeader` | 标题、说明和主操作 | 已实现 | 每页只有一个 h1，窄窗口操作进入更多菜单 |
| `PageToolbar` / `PageSection` | 筛选、状态和分区 | 已实现 | 工具栏最多两行，统一间距 |
| `BaseButton` / `BaseIconButton` | 页面操作 | 已实现 | primary、secondary、outline、ghost、danger；统一 loading/disabled |
| `BaseSelectableItem` | 日期、笔记、任务等可选择列表项 | 已实现 | 统一 selected、pressed、disabled、焦点、悬停和选择态；支持 card/row 外观，页面只负责内容布局 |
| `BaseInput` / `BaseTextarea` / `BaseSelect` | 表单输入 | 已实现 | label、错误、焦点和禁用状态由公共组件负责；Input 支持 default/plain/search/title 与 strong/completed 文本态；Textarea 支持 default/plain/editor、relaxed 正文、autosize 与 fillHeight |
| `BaseCheckbox` / `BaseRadio` / `BaseSwitch` | 选择输入 | 已实现 | 由 Naive UI 提供交互和可访问性，统一选中、禁用和说明文本；Checkbox 支持隐藏视觉标签但保留可访问名称 |
| `BaseTabs` / `BaseSegmented` / `FilterChip` | 导航与筛选 | 已实现 | 键盘导航、选中态、数量 Badge 和移除操作 |
| `BaseCard` / `BaseBadge` / `StatusIndicator` | 信息展示和状态 | 已实现 | variant 数量有限；BaseCard 通过 contentPadding/contentLayout/contentOverflow/fillHeight 承载布局差异，页面不得覆盖内部 `.n-card*` |
| `BaseProgress` | 线性与环形进度 | 已实现 | 默认 line 保持既有行为；circle 通过 size/strokeWidth/indicator slot 表达倒计时等语义 |
| `BaseDataTable` | 正式业务数据表格 | 已实现 | 内部使用 `NDataTable`；业务只依赖项目 columns/rows/density 类型，不直接导入 Naive UI 类型 |
| `BaseDisclosure` | 单项折叠与复合标题 | 已实现 | 受控 `v-model`、header/actions slot、default/card/plain；公开 header/content padding 与最小标题高度，内部统一键盘、ARIA 和展开状态 |
| `BaseSideNav` | 页面内垂直/横向导航 | 已实现 | 内部使用 `NMenu`；支持 vertical/horizontal/responsive、compact；横向默认隐藏编号以优先显示完整名称 |
| `BaseDialog` / `ConfirmDialog` | 弹窗与危险操作确认 | 已实现 | Esc、焦点、遮罩和堆叠策略统一 |
| `LoadingState` / `EmptyState` / `ErrorState` | 页面反馈 | 已实现 | 提供文案和重试动作插槽 |
| `AppToastHost` | 全站短操作反馈 | 已实现 | 业务只调用 notification Store；宿主通过适配器映射到 Naive Message，统一自动消失、手动关闭、悬停保留和持久通知 |

## 第三方 UI 组件适配层

| 组件/文件 | 用途 | 状态 | 约束 |
| --- | --- | --- | --- |
| `UiLibraryProvider.vue` | 全局 Config、Message、Dialog、Notification Provider | 已实现 | 只在应用壳挂载一次；业务 View 不直接创建 Provider |
| `NaiveUiShowcase.vue` | POC：输入、选择、日期、表格、标签和通知 | 已实现 | 仅用于开发预览与适配验收，不承载业务数据 |
| `adapters/naive-ui.ts` | Naive UI 主题变量到项目 Token 的映射 | 已实现 | 处理亮暗主题和现代 CSS 颜色格式，禁止在 View 中绕过适配层 |
| `adapters/notification-message.ts` | notification Store 到 Naive Message 的生命周期桥接 | 已实现 | Store 是唯一业务 API；Store remove/clear 与 Message 离场双向同步，宿主卸载不得反向修改业务状态 |
| `plugins/ui-library.ts` | 注册项目级 Provider | 已实现 | 统一入口；未来替换组件库时保持 View API 稳定 |

### 组件库决策

- 组件库：Naive UI `^2.44.1`。
- 运行时配套依赖：KaTeX `^0.16.47`（Naive UI 类型声明所需）。
- 引入策略：采用组件级导入；业务页面只能依赖项目 Base/适配组件，不能直接导入 `naive-ui`。
- 统一底层：已登记的 Base/Form/Navigation/Feedback 控件全部由 Naive UI 实现。原生 HTML 只允许出现在布局、语义包装或组件库明确不覆盖的宿主结构中，不再维护一套平行的原生控件视觉实现。
- 项目封装层：`Base*` 组件对外暴露项目自己的 props、events 和 slots；Naive UI 只作为内部实现细节。后续替换组件库时只改 `components/vendor`、`adapters` 和 Base 封装层。
- 弃用规则：禁止业务 View 直接导入 `naive-ui` 或 `element-plus`；如未来替换库，只改 `components/vendor`、`adapters` 和 `plugins/ui-library.ts`。

## 页面级候选

这些模式不在平台层凭空抽象，等页面完成 PG0～PG3 后再决定是否提升：

- 本地运行和部署：项目分组、项目卡片、日志查看器。
- 文件传输：文件树、传输队列、远程目录表格。
- 终端与编辑器：终端容器、标签栏、代码编辑器外壳。
- 用量和价格：图表容器、日期范围选择器、价格表格。
- 2FA 与纯净检查：验证码卡片、安全状态卡片。

## 提炼规则

1. 第二个页面出现同一语义后，才评审是否提升为公共组件。
2. 页面不得覆盖公共组件内部样式；需要新变体时先补组件契约和预览。
3. 新组件必须同步类型、亮暗主题预览、键盘/ARIA 测试和使用页面清单。
4. 业务 View 和页面私有组件禁止直接 `import ... from 'naive-ui'`；复杂控件也必须先进入项目 Base/适配层。

## 2026-07-31 组件架构专项补齐

首批补齐已经完成源码、预览、类型和组件测试，真实消费者将在后续逐页收口子项中接入：

- 表格：`BaseDataTable.vue` + `base-data-table.ts`，目标消费者为 Usage 正式数据表和 Run 历史表。
- 折叠：`BaseDisclosure.vue`，Settings 与 Todo 已接入；Twofa、Run 待逐页收口时评审。
- 侧边导航：`BaseSideNav.vue`，首个目标消费者为 Settings 分类导航。
- 进度：`BaseProgress` 新增 circle，首个目标消费者为 Twofa 倒计时环。
- 布局与表单变体：`BaseCard`、`BaseInput`、`BaseTextarea`、`BaseCheckbox` 的公开能力已用于 Notes、Notebook、Todo；Usage、Run 待继续收口。
- 可选择列表项：`BaseSelectableItem` 统一 Notes 日期、Notebook 笔记和 Todo 任务列表的选择、焦点与悬停语义，三个消费者均已接入。

通知宿主已在后续独立子项完成：`AppToastHost` 不再绘制 Toast 或管理定时器，而是通过项目 adapter 驱动 Naive Message；`NNotificationProvider` 保留给未来需要标题、描述或操作区的富通知，业务页面仍不得直接访问任一 Provider API。

首个业务消费者 Settings 已完成接入：分类导航使用 `BaseSideNav` 的 responsive/compact 契约，实验功能使用 `BaseDisclosure`，搜索结果使用 `BaseButton`；Settings 页面不再保留对应原生交互实现。
