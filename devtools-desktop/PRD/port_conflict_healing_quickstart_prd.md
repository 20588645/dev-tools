# DevTools Desktop 端口占用快速启动自愈需求文档 (PRD)

## 1. 变更背景与目的
在当前 0.1.83 版本中，如果用户未在前端项目的配置项中显式填写“服务端口”（即 `project.runPort` 留空），在点击主页卡片的“快速启动”按钮（对应 `quickStartRun`）启动该服务时，前端会跳过先置的端口冲突检测。
当底层 Node.js 或脚本运行检测到端口被占用而抛出错误（如 `"端口 8070 已被外部进程占用 (PIDs: 40989)"`）后，`quickStartRun` 的 `catch` 分支仅弹出了不可自愈的 `showAlert` 提示框（即“知道了”弹窗）。这就导致用户无法在这种情况下直接触发“自动强释端口并重启”的便携式修复路径，使用体验不连贯。

本需求旨在升级前端快速启动的异常捕获与诊断模块，使其在捕获到端口冲突报错后，能够智能分析冲突端口，诊断出占用该端口的外部 PID，并向用户提供强释并重启的自愈交互。

## 2. 详细技术方案

### 2.1 端口与外部进程冲突提取
在 `src/js/run.js` 中 `quickStartRun(projectName)` 触发的 `catch(e)` 块中：
1. **识别冲突错误**：通过 `e.message` 是否包含 `'已被外部进程'` 或 `'EADDRINUSE'` 来判定是否为端口占用错误。
2. **提取动态端口**：
   * 优先尝试取 `project.runPort` 或 `runningProjects[project.name]?.port`；
   * 如果取不到，则通过正则表达式提取 `e.message` 中包含的端口号：
     ```javascript
     const match = e.message.match(/端口\s*(\d{2,5})/);
     ```
3. **调用端口占用诊断**：
   * 使用提取出的 `activePort` 调用 `await checkPortOccupancyForProject(project.name, activePort)` 查询进程。
4. **触发自愈弹框**：
   * 从全局状态 `portOccupancyAlerts[project.name]` 中获取诊断得到的外部 PID。
   * 如果存在有效的 PID 及占用进程命令，调用 `showConfirm` 并弹出如下提示：
     > `启动失败：端口 ${activePort} 已被进程 ${alertInfo.command} (PID: ${alertInfo.pid}) 占用。\n是否自动释放端口并重新启动？`
   * 用户选择“释放并启动”，则直接调用 `await forceReleaseAndStart(project.name, alertInfo.pid)`；
   * 用户选择“取消”或无有效 PID，则退化调用 `showAlert('启动失败: ' + e.message, { icon: '❌' })`。

### 2.2 版本号同步更新
* 修改 `/package.json` 中的版本号字段至 `0.1.84`。
* 运行 `node scripts/sync-version.js` 以保持其他模块中（如 `src-tauri/Cargo.toml` 等）的版本号一致。

---

## 3. 测试与验证步骤

### 3.1 测试前提
* 验证项目没有配置显式的“服务端口”（在设置中将“服务端口”置空）。

### 3.2 手动测试用例
1. **端口冲突自愈成功验证**：
   * 打开系统终端，使用命令 `nc -l 8070` 或其它方式占用 8070 端口（假设项目启动会占用该端口）。
   * 点击 DevTools Desktop 卡片上的“快速启动”按钮。
   * **预期**：软件捕获启动异常，不直接弹出“知道了”对话框，而是弹出 `showConfirm` 对话框，询问“是否自动释放端口并重新启动”。点击“释放并启动”后，外部进程被终止，项目自愈并正常运行启动。
2. **非端口冲突异常退化验证**：
   * 修改项目启动命令为不存在的错误命令（例如 `npm run dev-invalid`）。
   * 点击 DevTools Desktop 卡片上的“快速启动”按钮。
   * **预期**：直接弹出普通的 `showAlert` 错误框，描述命令未找到等普通错误信息。
