# DevTools Desktop 运行日志一致性与彩色控制字符保留需求文档 (PRD)

## 1. 背景与目标
在本地运行前端项目时，用户发现在 DevTools Desktop 的日志面板中无法显示与 VS Code / 系统终端完全一致的彩色日志，并且在非 PTY 模式下可能会触发项目配置脚本的某些不兼容编译报错（如 `TypeError: cb is not a function`）。
此外，对于在代理过程中由于 VPN 或网络重置产生的 HPM（`http-proxy-middleware`）代理报错（如 `[HPM] Error occurred...`），系统在捕获到这些 `stderr` 输出或 `Error` 关键字时，会错误地将其识别为“本地项目编译报错”，并触发大红色背景的高对比度报错通知、弹窗底部红色提示条以及系统通知，对开发造成了不必要的视觉和通知干扰。

本项目标为：
* **保留 ANSI 彩色字符**：修改后端过滤策略，在检测/就绪正则匹配时使用干净的文本，在存储和广播时使用原始带颜色的 ANSI 字符，从而让前端 WebGL 及 Canvas 日志终端还原出 100% 真实的彩色日志。
* **伪装终端环境变量**：在 child_process.spawn 降级模式下也强行启用 `FORCE_COLOR=1` 及 `TERM=xterm-256color`，强制启用彩色输出，使其运行特性和日志格式与 VS Code / 标准终端保持完全一致，消除兼容报错。
* **过滤并淡化 HPM 代理错误**：
  * 精准匹配并屏蔽 `[HPM] Error` 类的日志触发编译报错（`compileStatus = 'error'`）状态及系统桌面通知。
  * 将其类型由 `error` 降级为 `warn`（黄色警告）或普通展示，在日志面板中不以刺目的红色进行特殊渲染。

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

### 2.3 精准排除并淡化 HPM 代理报错（Phase 5.1）
1. **后端过滤排除（`sidecar/routes/run.js`）**：
   在 `processPlainRunOutputLine` 中，通过正则判定 `/\[HPM\]\s+Error/i.test(clean)` 是否属于 HPM 代理错误。
   若为代理错误：
   * 绝不将其判定为 `isErrorLine = true`（即不调用 `markCompileError`，不进入编译报错状态）。
   * 将其广播类型强行修正为 `'warn'`，以黄色而非红色流向前端。
2. **前端日志着色防护（`src/js/app.js`）**：
   在 `appendLog` 中：
   * 新增正则检测 `/\[HPM\]\s+Error/i.test(clean)`。
   * 若匹配成功，直接将 `finalType` 重置为 `'warn'`，避免被后面的通用 `/Error/` 正则误判染为红色。

---

## 3. 验证计划
1. **日志色彩对比度测试**：
   * 启动一个前端项目（例如 Vite 或 Webpack 项目）。
   * **预期表现**：日志面板展现出与本地终端一致的色彩高亮（如编译完成显示绿色的 `compiled successfully`，地址显示蓝色的 `http://localhost:...` 链接等），不再是一成不变的普通着色。
2. **非 TTY 编译报错验证**：
   * 启动先前会抛出 `TypeError: cb is not a function` 的项目（如 `kangzhan-cloud`）。
   * **预期表现**：项目正常运行启动，完全不再抛出此 `TypeError` 错误，控制台编译输出无任何警示红底报错。
3. **HPM 代理报错静默与淡化测试**：
   * 在断开 VPN 或者项目后端服务未开启时，触发一次前端接口请求，使终端流出 `[HPM] Error occurred while trying to proxy...` 日志。
   * **预期表现**：
     * 终端日志中该行以黄色（warn）警告颜色字呈现，而不是大红色特殊展示；
     * 弹窗底部的“编译报错”错误提示条**不被唤醒**，小标签状态保持为“运行中”；
     * **不弹出**任何关于“本地项目编译报错”的系统桌面通知或 Toast 气泡。
