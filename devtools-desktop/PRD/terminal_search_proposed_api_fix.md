# 终端日志搜索及高亮功能修复需求文档

## 1. 业务背景
在终端全屏模式下，为了方便用户快速定位及检索大量的终端输出日志，引入了基于 `xterm-addon-search` 插件的实时日志查找功能（Search Bar）。但在之前版本中，虽然在输入框中输入了检索内容（如 `nvm`），匹配统计始终显示为 `0/0` 且终端中没有任何高亮匹配标识。

## 2. 问题定位与原因分析
通过对 Sidecar 及前端 WebSocket 深度联调排查，在客户端日志中截获了如下崩溃堆栈：
```
EXCEPTION: You must set the allowProposedApi option to true to use proposed API 
Stack: _checkProposedApi@http://127.0.0.1:1430/js/xterm.js:1:279308
registerDecoration@http://127.0.0.1:1430/js/xterm.js:1:281673
_createResultDecoration@http://127.0.0.1:1430/js/xterm-addon-search.js:1:11756
_highlightAllMatches@http://127.0.0.1:1430/js/xterm-addon-search.js:1:4367
```

**根本原因**：
`xterm.js` 的插件高亮修饰器 `registerDecoration` API 在当前版本中被归为提议期（Proposed API）。在实例化 `Terminal` 核心对象时，如果没有显式在配置对象中传递 `allowProposedApi: true`，xterm.js 在被插件调用该方法时会强制抛出类型检查异常，中断整个 `findNext` / `_highlightAllMatches` 计算流程，导致功能彻底静默失效。

## 3. 解决方案与修改计划

### 3.1 启用提议期 API 支持
修改 [src/js/terminal.js](file:///Users/ldy/personalTools/devtools-desktop/src/js/terminal.js) 中的终端 Tab 创建逻辑，在 `new Terminal({...})` 初始化参数中，显式声明启用提议期 API 支持：
```javascript
  const term = new Terminal({
    cursorBlink: true,
    allowProposedApi: true, // 允许插件使用提议期的 registerDecoration API
    fontFamily: '"SF Mono", Menlo, Monaco, Consolas, "JetBrains Mono", monospace',
    fontSize: 12,
    theme: { ... }
  });
```

### 3.2 亮暗双主题高亮对比度自适应优化
针对在暗色主题下明黄色高亮背景与终端命令行关键字（黄色语法高亮）对比度低下、极难看清文字内容的问题，将 `searchOptions` 改造为主题感知：
- **亮色模式**：继续沿用对比清晰的暖橙黄色 `#f7b955` 背景配合深色字体。
- **暗色模式**：动态切换为科技蓝色 `rgba(47, 115, 246, 0.85)`背景。蓝色与命令行常用的黄色、绿色等关键字语法前景色具有极强的视觉反差，能够显著改善字符的可读性。

### 3.3 禁用搜索框自动填充与联想提示气泡
在 macOS/WKWebView 中，输入框默认会根据用户的历史输入记录弹窗联想词气泡（如 `nvm` 的气泡及关闭按钮），容易遮挡界面且妨碍操作。
为从根源上禁用此功能，在 [src/index.html](file:///Users/ldy/personalTools/devtools-desktop/src/index.html#L661) 的 `#termSearchInput` 元素中声明了以下属性：
- `autocomplete="off"`：停用浏览器级历史纪录自动填充。
- `autocorrect="off"`：停用系统级文本自动修正。
- `autocapitalize="off"`：停用首字母自动大写。
- `spellcheck="false"`：停用英文拼写错误红波浪线提示。

### 3.4 全屏面板高斯模糊与层级遮挡优化
全屏模式下，为了防范侧边栏（Sidebar）层级过高浮于终端上方的问题，且为了提供更具 macOS 质感的磨砂玻璃视觉体验：
- **z-index 升级**：将全屏终端 `.terminal-panel-area.fullscreen` 的 `z-index` 调整为 `9999`，以完全盖住左侧导航菜单栏。
- **高斯毛玻璃滤镜**：在暗色模式下应用 `rgba(12, 16, 23, 0.8)` 半透明背景，亮色模式下应用 `rgba(248, 250, 252, 0.8)` 半透明背景，并开启 `backdrop-filter: blur(20px)`，使终端后方底图与菜单形成细腻自然的渐变高斯模糊。

### 3.5 全局 Escape 键分流退出机制
为了支持使用 `Esc` 键快速关闭检索状态或退出全屏终端，在 [src/js/terminal.js](file:///Users/ldy/personalTools/devtools-desktop/src/js/terminal.js#L108-L135) 的全局 `keydown` 监听器中设计了分流阻断处理：
- 当处于终端全屏状态下：
  - 若**检索框已激活**：按下 `Esc` 时拦截默认行为，仅关闭搜索框。
  - 若**检索框未激活**：按下 `Esc` 时拦截默认行为，直接退出终端全屏。

### 3.6 移除调试及桩代码
将联调调试期间在 [src/js/terminal.js](file:///Users/ldy/personalTools/devtools-desktop/src/js/terminal.js) 及 [sidecar/index.js](file:///Users/ldy/personalTools/devtools-desktop/sidecar/index.js) 中临时注入的 WebSocket `frontend-log` 自动测试计时器、日志写入方法全部清理干净，确保核心功能逻辑零残留，保证生产环境稳定性。

## 4. 验证计划
1. 启动 Tauri 开发环境，在“快捷命令”页打开终端。
2. 往终端中写入或输出包含特定检索关键词（例如 `nvm`）的内容。
3. 开启全屏模式，在日志查找搜索栏输入 `nvm`。
4. **验证亮暗配色效果**：
   - 切换到**亮色主题**：搜索 `nvm`，激活项显示为橙黄色背景，其余匹配项显示为淡黄色背景。
   - 切换到**暗色主题**：搜索 `nvm`，激活项显示为科技蓝色背景，其余匹配项显示为半透明蓝色背景。文字内容必须高对比度、清晰可见。
5. **验证背景模糊与遮挡**：在终端全屏模式下，左侧侧边栏应被完全遮挡在面板下方，全屏终端背景应当对底图和侧边栏形成自然的磨砂半透明高斯模糊。
6. **验证自动填充禁用**：在输入框中输入多次历史字符，确保不再弹出 WKWebView 自带的历史记录联想提示气泡。
7. **验证 Escape 键退出**：
   - 当搜索框开启时，在任意处按 `Esc` 键，搜索框应当且仅有关闭，终端保持全屏。
   - 当搜索框关闭时，按 `Esc` 键，全屏终端应当收缩，退回到默认网页视口。
8. 通过回车或上下箭头按钮能进行焦点轮巡跳转。
