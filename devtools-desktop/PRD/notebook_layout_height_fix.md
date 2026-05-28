# 笔记本页面默认高度异常修复执行计划 (PRD)

## 1. 问题描述
用户反馈：“笔记本页面初次打开时，如果没有点击笔记时，默认时的页面高度存在问题”。经排查发现，在未选择任何笔记时，编辑器内部无内容，页面被压缩得非常矮（仅 300px 左右），下方露出一大片无关的黑色背景。

## 2. 根源分析
在 [style.css](file:///Users/ldy/personalTools/devtools-desktop/src/css/style.css) 的后半段（第 9307 行）存在一份重复编写的老版笔记本样式：
```css
#page-notebook.active {
  display: block !important;
  height: 100%;
  overflow: hidden;
}
```
由于 CSS 的“就近原则”和“覆写原则”，此处的 `display: block !important` 覆盖了前半段（第 8849 行）我们新版设计的 `display: flex !important; flex-direction: column !important;`。
在 block 布局下，`.notebook-layout` 上的 `flex: 1` 无法生效。而此时它的高度又在特异性覆盖下被设为了 `height: auto !important`（由前半段设定），这就导致没有被笔记长文本撑开前，`.notebook-layout` 的物理高度直接缩短为 4 个笔记标题卡片的总高度，造成严重变形。

## 3. 修复方案
- 彻底移除后半段重复的 `#page-notebook.active` 块。
- 清理 `.notebook-layout` 内写死的 `height: calc(100vh - 130px)`。
- 让笔记本激活时的 `display: flex !important` 正常控制下方的 `.notebook-layout` 通过 `flex: 1` 垂直填满视窗剩余高度。

## 4. 验证计划
- 重新编译打包并部署重启。
- 打开“笔记本”功能页，在不选中、不点击任何笔记的默认状态下，验证 `.notebook-layout` 容器是否能够垂直撑满整个视口（仅留头部标题间距），保证在空白状态下依旧具备高级质感。
- 随意点击笔记、新建或删除，确认编辑器工作正常。
