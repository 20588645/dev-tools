# 侧栏更新气泡样式居中美化 PRD

## 1. 现状与问题描述
在侧边栏展开状态下，自动更新提示气泡药丸（`.sidebar-update-badge`）因为缺少 `justify-content` 属性的约束，在 `display: flex` 布局下内容默认靠左对齐。因为气泡的宽度被侧边栏拉伸为 `width: auto` 并通过 `margin: 12px 14px` 铺满侧栏可用宽度，导致气泡内部的 `✨` 和 `发现新版本` 整体偏左，右侧产生过多空白，在视觉上不够居中和平衡。用户反馈“文字太靠右”或视觉上存在偏差，需要进一步居中美化样式。

## 2. 改进方案
在 `.sidebar-update-badge` 的样式中显式添加 `justify-content: center !important;` 约束，使得图标和文字整体水平居中。
同时微调气泡的一些样式属性，进一步提升视觉高级感：
- 增加 `letter-spacing: 0.5px !important;` 微调文字间距，提升中文字体精致感。
- 将左右内边距 `padding: 8px 14px !important;` 微调为 `padding: 8px 16px !important;`，增强药丸两侧留白美感。
- 渐变色背景微调，稍微增加不透明度（`rgba(124, 58, 237, 0.85)` 和 `rgba(99, 102, 241, 0.85)`），提高在深色背景下的对比度和质感。
- 微调边框透明度，提供更好的玻璃拟态层级感。

## 3. 详细设计与代码变更
### 变更文件：[style.css](file:///Users/ldy/personalTools/devtools-desktop/src/css/style.css)

在样式类 `.sidebar-update-badge` 中：
```css
.sidebar-update-badge {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important; /* 核心修改：居中对齐 */
  gap: 8px !important;
  margin: 12px 14px !important;
  padding: 8px 16px !important; /* 左右间距微调 */
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.85), rgba(99, 102, 241, 0.85)) !important; /* 不透明度微调 */
  border: 1px solid rgba(255, 255, 255, 0.2) !important; /* 玻璃质感边框微调 */
  border-radius: 20px !important;
  color: #ffffff !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  cursor: pointer !important;
  box-shadow: 0 4px 15px rgba(124, 58, 237, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.25) !important;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
  animation: pulseGlowBadge 2.5s infinite ease-in-out !important;
  position: relative !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  width: auto !important;
  letter-spacing: 0.5px !important; /* 中文字间距微调 */
}
```

## 4. 验证计划
1. 在侧边栏展开状态下，检查“发现新版本”的提示气泡内部文字及星星图标是否完美水平居中对齐，左右两端留白是否对称。
2. 折叠侧边栏，检查更新气泡是否能正常收缩为正圆（34px * 34px）且只有 `✨` 图标并居中，右上角的发光红点定位正常。
