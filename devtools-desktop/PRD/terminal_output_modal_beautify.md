# 快捷命令执行结果弹窗化美化 PRD 文档

## 1. 变更背景与目的

在 `DevTools Desktop` 快捷命令页面中，原命令的执行日志与结果是硬性嵌套展示在页面底部的固定高度区域。这种展示方式存在以下痛点：
1. **视口遮挡与阅读不便**：底部的固定高度（最大 250px）导致长日志展示拥挤，用户需要频繁滚动，且遮挡了下方快捷命令卡片。
2. **缺乏视觉焦点**：执行大吞吐命令时，用户的视线主要集中在屏幕中部，底部弹出极易被忽视。

为了优化上述问题，我们将底部的执行结果面板升级为**全屏毛玻璃遮罩模态弹窗 (Glassmorphic Modal)**。由于用户允许在必要时修改 JS 逻辑，我们采用了最符合架构鲁棒性规范的 **classList 类名控制方案**。

---

## 2. 方案设计与实现

为了使该弹窗与项目中的整体 Modal 风格完美对齐，我们对 HTML 结构、CSS 样式和 JS 显隐控制逻辑进行了重构。

### 2.1 结构调整 (HTML Layer)

在 [index.html](file:///Users/ldy/personalTools/devtools-desktop/src/index.html) 中，重构 `#cmdOutputSection`：

```diff
-  <div class="cmd-output-section" id="cmdOutputSection" style="display:none">
-    <div class="cmd-output-header">
-      <span id="cmdOutputTitle">执行结果</span>
-      <button class="btn-text" onclick="closeCmdOutput()">✕ 关闭</button>
-    </div>
-    <pre class="cmd-output" id="cmdOutput"></pre>
-  </div>
+  <div class="cmd-output-section modal-overlay" id="cmdOutputSection">
+    <div class="modal modal-quick">
+      <div class="modal-header">
+        <h2 id="cmdOutputTitle">执行结果</h2>
+        <button class="modal-close" onclick="closeCmdOutput()" title="关闭">✕</button>
+      </div>
+      <div class="modal-body" style="padding: 0;">
+        <pre class="cmd-output" id="cmdOutput"></pre>
+      </div>
+    </div>
+  </div>
```

*   **移去内联 Display**：移除了 HTML 上的 `style="display:none"`，改由 CSS 类的默认状态隐藏，以杜绝 inline style 与类样式的冲突。
*   **服用 Modal 体系与点击外部关闭**：直接套用项目内已有的 `.modal` 结构与 `.modal-close` 按钮。通过添加 `.modal-overlay` 类，直接被全局的 `setupModalDismissal()` 遮罩按下事件捕获，点击弹窗外侧空白区域可天然实现点击关闭，无需再手写冗余事件监听。

### 2.2 JS 显隐控制逻辑重构 (JS Layer)

在 [terminal.js](file:///Users/ldy/personalTools/devtools-desktop/src/js/terminal.js) 中，由对 `style.display` 的直接操作改为操作 `.classList`：

```diff
  // 显示输出区
  const section = document.getElementById('cmdOutputSection');
  const output = document.getElementById('cmdOutput');
  const title = document.getElementById('cmdOutputTitle');
- section.style.display = 'block';
+ section.classList.add('active');
  title.textContent = `执行: ${cmd.name}`;
  output.textContent = '⏳ 执行中...';
```

以及：

```diff
function closeCmdOutput() {
- document.getElementById('cmdOutputSection').style.display = 'none';
+ document.getElementById('cmdOutputSection').classList.remove('active');
}
```

### 2.3 弹窗及遮罩样式 (CSS Layer)

在 [style.css](file:///Users/ldy/personalTools/devtools-desktop/src/css/style.css) 中：

1.  **遮罩化改造**：将原本位于底部的 `.cmd-output-section` 默认定义为 `display: none`，并升级为 `position: fixed` 的全屏 Overlay 容器。
2.  **类名激活**：
    当添加了 `.active` 类名时，激活为居中的 Flex 布局：
    ```css
    .cmd-output-section {
      display: none;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      background: var(--bg-overlay) !important;
      backdrop-filter: blur(6px) !important;
      -webkit-backdrop-filter: blur(6px) !important;
      z-index: 10000 !important;
      align-items: center !important;
      justify-content: center !important;
    }
    .cmd-output-section.active {
      display: flex !important;
      animation: fadeIn 0.15s ease-out !important;
    }
    ```
3.  **终端样式优化与高度固定**：
    将 `.cmd-output` 的内容区域设置为符合开发者控制台的黑盒背景，并设定固定的 `height: 380px !important`，使弹窗在执行不同命令时保持高度恒定，消除高度跳跃带来的视觉割裂感，多余日志支持内部垂直滚动。


---

## 3. 验证计划

- **视觉测试**：进入快捷命令页面，运行任一命令（例如“测试”），应立即在视口中央弹出毛玻璃滤镜的执行结果窗口，而不是在底部显示。
- **功能测试**：
  - 点击右上角 `✕` 按钮，弹窗应正确隐去。
  - 在执行过程中，日志能正确增量刷入。
  - 窗口能够跟随全局主题（外观：☀/☾）自动进行 Light/Dark 模式下的色调转换。
