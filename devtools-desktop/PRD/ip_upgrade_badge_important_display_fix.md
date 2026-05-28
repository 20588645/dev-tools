# 侧栏更新提示隐藏失效缺陷修复 PRD

## 1. 现状与缺陷描述
在点击更新气泡并显示“当前已是最新版本”后，界面左下角的更新提示气泡（`.sidebar-update-badge`）仍然在页面上显示，没有被成功隐藏。
**根本原因**：
在 [style.css](file:///Users/ldy/personalTools/devtools-desktop/src/css/style.css#L12675) 的样式规则中，定义了 `display: flex !important;`。
在 JS 执行 `badge.style.display = 'none'` 时，由于内联样式的权重较低，无法覆盖 CSS 类声明中带有 `!important` 的样式。因此，气泡在被 JS 隐藏后，浏览器仍然依据 `!important` 将其呈现为 `display: flex`，导致隐藏逻辑失效。

## 2. 解决方案
为了彻底解决此问题并确保未来绝对不会再次发生由于 CSS 样式层级导致的显隐失效：
1. **清理反模式样式**：在 [style.css](file:///Users/ldy/personalTools/devtools-desktop/src/css/style.css#L12675) 中，移除 `.sidebar-update-badge` 的 `display: flex !important;` 上的 `!important`，恢复为标准普通的 `display: flex;`。
2. **增强 JS 控制权（双重防御）**：在 [app.js](file:///Users/ldy/personalTools/devtools-desktop/src/js/app.js) 的 [showGlobalUpgradeIndicator](file:///Users/ldy/personalTools/devtools-desktop/src/js/app.js#L1043) 函数中，将显隐逻辑重构为使用 `badge.style.setProperty('display', '...', 'important')` 进行强制性高权重显示与隐藏。即便将来有其他 CSS 再次误用 `!important` 覆盖此元素，JS 也能凭借最高优先级的内联 `!important` 完美隐藏或显示它。

## 3. 详细设计与代码变更
### 1. 样式表 [style.css](file:///Users/ldy/personalTools/devtools-desktop/src/css/style.css#L12675)
```diff
 .sidebar-update-badge {
-  display: flex !important;
+  display: flex;
   align-items: center !important;
```

### 2. 交互逻辑 [app.js](file:///Users/ldy/personalTools/devtools-desktop/src/js/app.js#L1043)
```javascript
function showGlobalUpgradeIndicator(show) {
  const badge = document.getElementById('sidebarUpdateBadge');
  if (badge) {
    if (show) {
      badge.style.setProperty('display', 'flex', 'important');
    } else {
      badge.style.setProperty('display', 'none', 'important');
    }
  }
  renderSidebar();
}
```

## 4. 验证计划
1. 打开应用，点击“发现新版本”按钮。
2. 点击后触发实时检测。当弹出 Toast “✨ 您当前已是最新版本！” 时，确认左下角的紫色更新气泡已经**彻底隐去**。
3. 折叠和展开侧边栏，确认隐去后不会被二次触发显现。
