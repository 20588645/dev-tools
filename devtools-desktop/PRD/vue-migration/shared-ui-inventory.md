# 共享 UI 现状盘点

> 状态：Phase 2 平台层启动，首批基础组件已确定；页面专属组件在对应 Page Gate 研究后提炼。

## 首批基础组件

| 组件 | 使用语义 | 首批状态 | 约束 |
| --- | --- | --- | --- |
| `PageFrame` / `PageBody` | 页面外壳与滚动区域 | 待实现 | 页面顶部不参与正文滚动，支持 standard / immersive / workspace |
| `PageTop` / `PageHeader` | 标题、说明和主操作 | 待实现 | 每页只有一个 h1，窄窗口操作进入更多菜单 |
| `PageToolbar` / `PageSection` | 筛选、状态和分区 | 待实现 | 工具栏最多两行，统一间距 |
| `BaseButton` / `BaseIconButton` | 页面操作 | 待实现 | primary、secondary、outline、ghost、danger；统一 loading/disabled |
| `BaseInput` / `BaseTextarea` / `BaseSelect` | 表单输入 | 待实现 | label、错误、焦点和禁用状态由公共组件负责 |
| `BaseCard` / `BaseBadge` / `StatusIndicator` | 信息展示和状态 | 待实现 | variant 数量有限，状态必须有语义 |
| `BaseDialog` / `ConfirmDialog` | 弹窗与危险操作确认 | 待实现 | Esc、焦点、遮罩和堆叠策略统一 |
| `LoadingState` / `EmptyState` / `ErrorState` | 页面反馈 | 待实现 | 提供文案和重试动作插槽 |

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
