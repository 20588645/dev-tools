# 页面头部固定定位与内容独立滚动重构需求文档 (PRD)

## 1. 概述
当前应用除了部署页面外，其他页面的顶部头部（标题、副标题及操作按钮）没有固定，会出现向下滚动时头部跟随页面一起移动滑走的情况。这破坏了原生桌面应用的质感。本期需求旨在通过对应用整体容器布局的微调，将所有页面的 Header 锁定在视口顶部，仅让内容区域进行独立滚动。

## 2. 问题定位与解决方案

### 2.1 根源定位
外层容器 `.main-content` 被赋予了 `overflow-y: auto` 和 `height: 100vh`。由于其自身带有较大的 padding，在子页面 `.page` 展开且高度较高时，外层容器就会发生滚动，从而带着整个 `.page` 及其顶部的 Header 一起向上滚动滑出视口。

### 2.2 解决方案
- **杜绝外层滚动**：将外层容器 `.main-content` 设为 `overflow-y: hidden !important` 并转为 `flex` 容器，高度填充为 `100vh` 且 box-sizing 设置为 `border-box`。
- **让子页面自主管理滚动**：将子页面 `.page.active` 设为高度占满的 `flex` 容器，头部 `.page-header-bar` 和 `.page-toolbar` 锁死不缩放（`flex-shrink: 0`）。
- **内容容器独立滚动**：将各子页面的核心内容容器（如待办的 `.todo-board`、本地运行的 `.run-project-grid`、设置的 `.settings-content` 等）设置为 `flex: 1; overflow-y: auto;`。

## 3. 具体页面重构映射

| 页面 ID | 激活样式 (.active) | 头部 (.page-header-bar) | 主内容区域 (滚动) |
| :--- | :--- | :--- | :--- |
| `#page-home` | `display: block; overflow-y: auto;` | 无 (作为大看板整体滚动) | 整个页面滚动 |
| `#page-todo` | `display: flex; flex-direction: column; overflow: hidden;` | `flex-shrink: 0;` | `.todo-board` (`flex: 1; overflow-y: auto;`) |
| `#page-run` | `display: flex; flex-direction: column; overflow: hidden;` | `flex-shrink: 0;` | `.run-project-grid` (`flex: 1; overflow-y: auto;`) |
| `#page-deploy` | `display: flex; flex-direction: column; overflow: hidden;` | `flex-shrink: 0;` | 各 `.sub-page` 独立内部滚动 |
| `#page-terminal` | `display: flex; flex-direction: column; overflow: hidden;` | `flex-shrink: 0;` | `.cmd-grid` (`flex: 1; overflow-y: auto;`) |
| `#page-notebook` | `display: flex; flex-direction: column; overflow: hidden;` | `flex-shrink: 0;` | `.notebook-layout` 内置左树右文本编辑器独立滚动 |
| `#page-report` | `display: flex; flex-direction: column; overflow: hidden;` | `flex-shrink: 0;` | `.report-main` 内置左侧配置与右侧生成的周报独立滚动 |
| `#page-notes` | `display: flex; flex-direction: column; overflow: hidden;` | `flex-shrink: 0;` | `.notes-body` (`flex: 1; overflow-y: auto;`) |
| `#page-settings` | `display: flex; flex-direction: column; overflow: hidden;` | `flex-shrink: 0;` | `.settings-content` (`flex: 1; overflow-y: auto;`) |

## 4. 验证计划
- 逐个点击侧边栏菜单，确认每个页面都能正确打开。
- 打开“待办看板”，向下滚动，验证“📌 待办看板”标题和操作栏是否纹丝不动地固定在顶部。
- 打开“设置”页面并向下滚动，验证顶部的“⚙️ 设置”标题是否依然保持固定在视口最上方。
- 验证“笔记本”和“快捷命令”等页面在不同屏幕尺寸下是否自适应良好，滚动区域无溢出和重叠。
