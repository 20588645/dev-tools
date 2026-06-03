# DevTools Desktop 运行日志一致性与彩色控制字符保留需求文档 (PRD)

## 1. 背景与目标
在本地运行前端项目时，用户发现在 DevTools Desktop 的日志面板中无法显示与 VS Code / 系统终端完全一致的彩色日志，并且在非 PTY 模式下可能会触发项目配置脚本的某些不兼容编译报错（如 `TypeError: cb is not a function`）。

经诊断，原因为：
1. 后端 Sidecar 的 `pushLog` 及 `handleRunOutput` 逻辑在处理日志时，强行调用了 `stripTerminalControl` 过滤了全部终端 ANSI 控制字符（包括颜色控制码），这使得前端接收到的仅是纯文本；
2. 当 `node-pty` 降级为普通的 `child_process.spawn` 时，环境变量配置将 `TERM` 设为了 `dumb`，并将 `FORCE_COLOR` 设为了 `0`，从而迫使子进程的 Webpack/Chalk 等模块在非 TTY 的哑终端下以无色且受限的模式运行，改变了库的钩子和参数发布行为，暴露出了编译期兼容漏洞。

本项目标为：
* **保留 ANSI 彩色字符**：修改后端过滤策略，在检测/就绪正则匹配时使用干净的文本，在存储和广播时使用原始带颜色的 ANSI 字符，从而让前端 WebGL 及 Canvas 日志终端还原出 100% 真实的彩色日志。
* **伪装终端环境变量**：在 child_process.spawn 降级模式下也强行启用 `FORCE_COLOR=1` 及 `TERM=xterm-256color`，强制启用彩色输出，使其运行特性和日志格式与 VS Code / 标准终端保持完全一致，消除兼容报错。

---

## 2. 详细技术方案

### 2.1 环境变量统一伪装
在 `devtools-desktop/sidecar/routes/run.js` 的 `buildRunEnv` 中：
无论是否是 PTY 模式，都统合设置环境变量：
```javascript
env.TERM = 'xterm-256color';
env.FORCE_COLOR = '1';
delete env.NO_COLOR;
```

### 2.2 保留 ANSI 颜色的日志分流机制
在日志分析与状态流转层面，将“干净文本（用于逻辑匹配）”与“原始文本（用于显示和广播）”解耦：
1. **`handleRunOutput`**：使用原始 `text` 拼接至 `outputBuffer`。分割为多行后，用 `stripTerminalControl(line)` 的结果做空行过滤与 `processRunOutputLine` 调用。
2. **`processRunOutputLine`** 和 **`processPlainRunOutputLine`**：
   * 采用 `const clean = stripTerminalControl(line)` 用于识别 `ready` 行、`compiling` 行和 `error` 行。
   * 调用 `pushLog` 时传入原始的 `line`。
3. **`pushLog`**：
   * 采用 `cleanText = stripTerminalControl(text)` 检查内容有效性。
   * 保存到 `job.logs` 及发送 Websocket 时使用原始的 `text`（保留 ANSI 颜色）。

---

## 3. 验证计划
1. **日志色彩对比度测试**：
   * 启动一个前端项目（例如 Vite 或 Webpack 项目）。
   * **预期表现**：日志面板展现出与本地终端一致的色彩高亮（如编译完成显示绿色的 `compiled successfully`，地址显示蓝色的 `http://localhost:...` 链接等），不再是一成不变的普通着色。
2. **非 TTY 编译报错验证**：
   * 启动先前会抛出 `TypeError: cb is not a function` 的项目（如 `kangzhan-cloud`）。
   * **预期表现**：项目正常运行启动，完全不再抛出此 `TypeError` 错误，控制台编译输出无任何警示红底报错。
