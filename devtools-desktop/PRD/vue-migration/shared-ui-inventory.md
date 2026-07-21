# 共享 UI 现状盘点

> 状态：Phase 2-D 已完成自动化、浏览器与用户手动 E2E；已具备进入 Phase 3 页面级门禁的条件。

## 首批基础组件

| 组件 | 使用语义 | 首批状态 | 约束 |
| --- | --- | --- | --- |
| `PageFrame` / `PageBody` | 页面外壳与滚动区域 | 已实现 | 页面顶部不参与正文滚动，支持 standard / immersive / workspace |
| `PageTop` / `PageHeader` | 标题、说明和主操作 | 已实现 | 每页只有一个 h1，窄窗口操作进入更多菜单 |
| `PageToolbar` / `PageSection` | 筛选、状态和分区 | 已实现 | 工具栏最多两行，统一间距 |
| `BaseButton` / `BaseIconButton` | 页面操作 | 已实现 | primary、secondary、outline、ghost、danger；统一 loading/disabled |
| `BaseInput` / `BaseTextarea` / `BaseSelect` | 表单输入 | 已实现 | label、错误、焦点和禁用状态由公共组件负责 |
| `BaseCheckbox` / `BaseRadio` / `BaseSwitch` | 选择输入 | 已实现 | 保留原生表单语义，统一选中、禁用和说明文本 |
| `BaseTabs` / `BaseSegmented` / `FilterChip` | 导航与筛选 | 已实现 | 键盘导航、选中态、数量 Badge 和移除操作 |
| `BaseCard` / `BaseBadge` / `StatusIndicator` | 信息展示和状态 | 已实现 | variant 数量有限，状态必须有语义 |
| `BaseDialog` / `ConfirmDialog` | 弹窗与危险操作确认 | 已实现 | Esc、焦点、遮罩和堆叠策略统一 |
| `LoadingState` / `EmptyState` / `ErrorState` | 页面反馈 | 已实现 | 提供文案和重试动作插槽 |

## 第三方 UI 组件适配层

| 组件/文件 | 用途 | 状态 | 约束 |
| --- | --- | --- | --- |
| `UiLibraryProvider.vue` | 全局 Config、Message、Dialog、Notification Provider | 已实现 | 只在应用壳挂载一次；业务 View 不直接创建 Provider |
| `NaiveUiShowcase.vue` | POC：输入、选择、日期、表格、标签和通知 | 已实现 | 仅用于开发预览与适配验收，不承载业务数据 |
| `adapters/naive-ui.ts` | Naive UI 主题变量到项目 Token 的映射 | 已实现 | 处理亮暗主题和现代 CSS 颜色格式，禁止在 View 中绕过适配层 |
| `plugins/ui-library.ts` | 注册项目级 Provider | 已实现 | 统一入口；未来替换组件库时保持 View API 稳定 |

### 组件库决策

- 组件库：Naive UI `^2.44.1`。
- 运行时配套依赖：KaTeX `^0.16.47`（Naive UI 类型声明所需）。
- 引入策略：当前 POC 采用组件级导入；业务页面只能依赖项目 Base/适配组件。
- 保留原生控件：简单输入、Checkbox、Radio、Switch 继续使用项目 Base 组件，避免为低复杂度控件增加不必要体积。
- 优先使用组件库：复杂下拉、日期选择、表格、分页、树、通知和弹层。
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
