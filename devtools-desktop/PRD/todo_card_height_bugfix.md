# 待办看板卡片高度拉伸问题修复方案

## 1. 背景与现状分析
在“待办看板”页面中，当看板内容较少时，待办卡片在高度上会被异常拉伸，导致卡片内部出现大面积无用的黑色空白，布局体验极其突兀。

经多维度排查，该问题的深层成因如下：
1. **Grid 布局 stretch 拉伸传导**：待办看板的容器 `.todo-board` 采用了 CSS Grid 布局，且被 `#page-todo > .todo-board` 设为 `flex: 1`。作为 Grid 子项的待办列 `.todo-column` 没有强力的垂直自适应策略，在 Grid 容器中默认被 `align-items: stretch` 拉伸至屏幕高度의 100%。
2. **Flex 弹性撑满**：待办列内部的 `.todo-column-list` 被赋予了 `flex: 1`，被迫填满被拉伸的 `.todo-column` 空间。
3. **缺少靠顶对齐约束**：纵向 flex 容器 `.todo-column-list` 缺乏显式的 `justify-content: flex-start` 约束。在特定 WebView (如 Tauri 内核的 WebKit) 的某些特定版本中，当 flex 容器高度过大时，即使子卡片 `.todo-card` 设有 `flex: 0 0 auto`，其子元素的高度依然可能被隐式拉伸以占据空间。

---

## 2. 改造方案

为彻底斩断高度拉伸在 CSS 层面的传导链条，我们将采取“三管齐下”的强力自适应重构：

### 2.1 列容器层级 (Column Level)
在列容器 `.todo-column` 样式中，显式设定高度自适应策略，阻止 CSS Grid 强制拉伸列高度。同时，保留 `min-height: 200px` 确保在无任务时也有合理的占位和可操作区域：
```css
.todo-column {
  /* ...原有基础样式... */
  align-self: start !important;        /* 强制在 Grid 侧轴（垂直方向）靠顶对齐，避免列高度拉伸 */
  height: fit-content !important;      /* 强制高度自适应内容 */
}
```

### 2.2 列表容器层级 (List Level)
在列表容器 `.todo-column-list` 样式中，强力追加 `justify-content: flex-start`。这确保其子项（即卡片）在纵向上从顶部紧密堆叠，任何多余的空白空间均在列表最底部留空，而绝不会拉伸卡片自身或在卡片间进行无谓的均分：
```css
.todo-column-list {
  /* ...原有基础样式... */
  justify-content: flex-start !important; /* 强力约束卡片在垂直方向靠顶紧贴，不发生高均分或撑大 */
}
```

### 2.3 卡片层级 (Card Level)
巩固 `.todo-card` 及其主要子代的高度自适应规则，确保没有任何残留属性会改变其高度自适应行为：
```css
.todo-card {
  /* ...原有基础样式... */
  height: auto !important;             /* 强制高度自适应，由内容撑开 */
  flex: 0 0 auto !important;            /* 拒绝弹性拉伸 */
}
```

---

## 3. 验证计划

### 3.1 单元验证
- 修改 style.css 后，在开发环境进行 `npm run dev` 构建或直接查看界面。
- **验证项 1**：待办卡片在内容少时（例如只有 1 项子任务），卡片高度是否紧凑收缩，大面积黑色空白是否完全消失。
- **验证项 2**：第一列包含 2 个卡片，第二列包含 1 个卡片，此时各列 the 卡片是否均呈现出与各自内容高度匹配的自适应高度（即高度高矮不一，均无冗余空白）。
- **验证项 3**：卡片悬浮、状态移动流转等原有交互功能是否 100% 完好。

### 3.2 编译与部署验证
- 执行编译指令打包成下一版本，在本地客户端安装，核对实际的 UI 呈现状态。
