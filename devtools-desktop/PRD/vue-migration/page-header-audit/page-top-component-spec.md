# PageTop 公共组件规格

> 状态：设计建议，待 HTML 原型确认  
> 依据：`assessment.md` 中的 14 页面真实截图与尺寸测量

## 1. 设计原则

1. 统一骨架，不统一业务内容。
2. 通过组合和 Slot 兼容页面差异，不使用几十个布尔 props。
3. 页面顶部与可滚动正文分离，避免每个页面自行实现 sticky/fixed。
4. 默认窗口保持紧凑，最小窗口最多扩展为两行 Toolbar。
5. 主操作始终清楚，低频操作在空间不足时进入更多菜单。
6. 组件只使用 Semantic 和 Component Token，不接受页面深层覆盖。

## 2. 组件结构

```text
PageFrame
├── PageTop                        可选；首页 immersive 模式省略
│   ├── PageHeader
│   │   ├── AppIcon
│   │   ├── PageHeading
│   │   │   ├── h1
│   │   │   └── description
│   │   └── PageActions            可选
│   ├── PageSubnav                 可选
│   └── PageToolbar                可选
└── PageBody
```

### 2.1 PageFrame

职责：

- 建立 `display:flex; flex-direction:column; min-height:0` 页面骨架。
- `PageTop` 固定在正文滚动容器之外。
- `PageBody` 独立滚动。
- 支持 `standard` 和 `immersive` 两种结构；首页使用 `immersive`。

不负责：

- 页面业务状态。
- 标题、按钮和筛选内容。
- 业务工作区内部工具栏。

### 2.2 PageTop

职责：

- 统一顶部背景、边界、间距和行间距。
- 管理标题行、子导航行和工具栏行的排列。
- 内容滚动后增加轻量分隔线或阴影，不改变高度。

建议 props：

```ts
interface PageTopProps {
  density?: 'default' | 'compact'
  divided?: boolean
}
```

不提供 `hasToolbar`、`hasTabs`、`hasSearch` 等布尔属性；是否存在由 Slot 内容决定。

### 2.3 PageHeader

建议 props：

```ts
interface PageHeaderProps {
  title: string
  description?: string
  icon?: Component
  headingId?: string
}
```

Slots：

- `actions`：只允许 `PageActions` 或数量受控的 BaseButton。
- `meta`：极少量标题旁状态，例如 Beta，不承载筛选。

语义：

- `title` 渲染为当前页面唯一 `h1`。
- `description` 通过 `aria-describedby` 与标题区域关联。
- 图标使用统一 SVG 组件，不使用 Emoji 作为结构图标。

### 2.4 PageActions

操作分级：

| 级别 | 展示规则 | 示例 |
| --- | --- | --- |
| Primary | 始终可见，最多 1 个 | 添加项目、新建任务、添加账号 |
| Secondary | 宽屏可见，窄屏可进入更多菜单 | 导入、导出、订阅设置 |
| Utility | 使用图标按钮或 Toolbar | 刷新、保存、运行历史 |
| Destructive | 不作为普通主按钮常驻标题行 | 清空、批量删除 |

建议 props：

```ts
interface PageActionsProps {
  collapseAt?: 'never' | 'compact' | 'narrow'
  overflowLabel?: string
}
```

### 2.5 PageSubnav

用于部署面板这类页面级子导航：

- 使用 `role="tablist"` 或真正的子路由导航语义。
- 支持方向键和 Home/End。
- 不与数据筛选 Chip 混用。
- 移动或窄窗口时允许横向滚动，不随意折成多行。

### 2.6 PageToolbar

建议 Slots：

- `primary`：搜索、主要上下文输入。
- `filters`：Chip、日期范围、状态筛选。
- `status`：同步状态、连接状态、保存状态。
- `actions`：刷新、历史等上下文操作。

建议结构：

```vue
<PageToolbar>
  <template #primary>...</template>
  <template #filters>...</template>
  <template #status>...</template>
  <template #actions>...</template>
</PageToolbar>
```

PageToolbar 只提供布局，不理解页面筛选值。

### 2.7 PageBody

- 作为唯一页面级滚动容器。
- 提供 `default`、`flush`、`workspace` 三种有限内边距模式。
- 编辑器、终端、笔记等页面使用 `workspace`，业务工作区内部可以拥有自己的工具条和标签栏。

## 3. 尺寸与 Token

建议组件 Token：

```css
:root {
  --page-top-row-gap: var(--space-3);
  --page-top-content-gap: var(--space-4);
  --page-top-padding-inline: var(--space-0);
  --page-top-padding-block: var(--space-0);
  --page-top-divider: var(--border-subtle);
  --page-top-stuck-shadow: var(--shadow-sticky);

  --page-header-min-height: 48px;
  --page-header-title-size: var(--font-size-xl);
  --page-header-title-line-height: 1.25;
  --page-header-description-size: var(--font-size-sm);
  --page-header-description-color: var(--text-secondary);
  --page-header-icon-size: 20px;

  --page-toolbar-min-height: 36px;
  --page-toolbar-gap: var(--space-3);
}
```

具体颜色值只在 Primitive/Semantic Token 中定义，组件 Token 不写亮暗主题硬编码颜色。

## 4. 响应式规则

使用 PageFrame 容器宽度，而不是设备名称判断：

### ≥ 960px 内容宽度

- PageHeader 单行。
- 全部已批准的标题操作可见。
- Toolbar 单行，搜索可增长，状态与操作靠右。

### 720～959px 内容宽度

- PageHeader 仍保持单行；长说明允许两行。
- 标题行只保留 Primary，Secondary 进入更多菜单。
- Toolbar 最多两行：第一行搜索，第二行筛选、状态和上下文操作。
- 筛选组优先横向滚动，不无限换行。

### < 720px 内容宽度

当前 Tauri 最小窗口下折叠侧栏后才可能接近该范围：

- PageHeader 的操作可以换到标题下方。
- Toolbar 每个功能组独占一行。
- 不隐藏业务状态；用更短文案或图标 + Tooltip。

## 5. 页面兼容矩阵

| 页面 | PageFrame | PageHeader | PageActions | PageSubnav | PageToolbar | 私有工作区 Toolbar |
| --- | --- | --- | --- | --- | --- | --- |
| 首页 | immersive | — | — | — | — | — |
| 本地运行 | standard | 是 | 添加项目 | — | 搜索、筛选、停止、历史 | — |
| 部署面板 | standard | 是 | 添加项目 | 项目/服务器/历史 | 随子页变化 | — |
| 文件传输 | standard | 是 | 刷新 | — | 服务器、连接、状态 | 文件双栏内部操作 |
| 快捷命令 | standard | 是 | 添加命令 | — | sudo、保存、配置状态 | 终端标签工具条 |
| 待办事项 | standard | 是 | 新建任务、更多 | — | 可省略 | 看板内部工具 |
| 代码周报 | standard | 是 | 视 PG3 决定 | — | 视流程决定 | 配置面板操作 |
| 工时内容 | standard | 是 | — | — | 周导航、周末、参考 | — |
| 个人笔记 | standard | 是 | — | — | — | 搜索、新建、编辑操作 |
| 文件编辑 | standard | 是 | 打开/保存/更多 | — | — | 文件标签、查找替换 |
| 纯净检测 | standard | 是 | — | — | IP 输入、检测、我的 IP | — |
| 2FA | standard | 是 | 添加账号、更多 | — | 搜索、分组、同步状态、刷新 | — |
| 用量统计 | standard | 是 | 重新扫描、更多 | — | 日期、应用筛选、同步状态 | — |
| 系统设置 | standard | 是 | — | — | — | — |

## 6. 典型使用示例

### 本地运行

```vue
<PageFrame>
  <template #top>
    <PageTop>
      <PageHeader title="本地运行" :icon="PlayIcon" description="快速启动前端开发服务，管理模块、日志和本地地址">
        <template #actions>
          <PageActions>
            <BaseButton variant="primary">添加项目</BaseButton>
          </PageActions>
        </template>
      </PageHeader>

      <PageToolbar>
        <template #primary><SearchField v-model="query" /></template>
        <template #filters><RunFilters v-model="filter" /></template>
        <template #actions><RunHeaderUtilities /></template>
      </PageToolbar>
    </PageTop>
  </template>

  <PageBody>...</PageBody>
</PageFrame>
```

### 系统设置

```vue
<PageFrame>
  <template #top>
    <PageTop>
      <PageHeader title="系统设置" :icon="SettingsIcon" description="全局配置与系统信息" />
    </PageTop>
  </template>

  <PageBody>...</PageBody>
</PageFrame>
```

## 7. 禁止项

- 不允许页面通过 `#page-x .page-title` 修改公共标题。
- 不允许为单页需求给 PageHeader 增加业务命名 prop。
- 不允许在 PageHeader 中放业务表格、项目卡片或编辑器标签。
- 不允许页面自行实现 sticky/fixed 顶部。
- 不允许标题行长期显示两个以上同权重 Primary Button。
- 不允许 Toolbar 在最小窗口无限换行。
- 不允许结构性图标继续使用无法控制基线和色彩的 Emoji。

## 8. 验收标准

- 同一组件实例可以表达简单、带操作、带子导航、带工具栏和沉浸式例外五类页面。
- 14 个页面全部能映射到兼容矩阵，不需要页面 ID 样式覆盖。
- 1665 × 1184 下普通两行顶部高度稳定在约 104～112px。
- 900 × 600 下顶部最多两行 Toolbar，不产生页面级横向滚动。
- 亮色、暗色只切换 Token，DOM 和组件 props 不变化。
- 标题语义、键盘顺序、焦点、按钮可访问名称通过测试。
- 修改 PageHeader 标题字号或间距后，组件预览中的全部页面样例同步变化。

## 9. 下一步

在进入正式 Vue 组件开发前，基于本规格制作一份亮色、暗色、默认窗口和最小窗口都可切换的 HTML 原型，至少展示本地运行、部署面板、个人笔记、2FA、用量统计和系统设置六种代表状态。
