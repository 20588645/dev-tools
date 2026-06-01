# 本地运行服务孤儿进程泄露及生命周期修复需求文档

## 1. 业务背景
在“本地运行”页面中，用户可以启动和运行不同的前端项目服务（如 `npm run dev`）。在现有版本中，当用户退出应用或进行软件更新重启后，之前启动的项目服务虽然仍能正常访问（这说明孤儿进程仍然在后台默默运行），但在重新开启的软件中“本地运行”页面已经无法感知其运行状态并显示为“未运行”。这不仅导致前后端运行状态不一致，还会因为后台残留的孤儿进程占用 CPU、内存以及服务端口，从而造成再次启动服务时的**端口冲突 (Port in Use)**。

## 2. 问题定位与原因分析

### 2.1 Node.js 侧（Sidecar）生命周期的异步清理缺陷
在 `sidecar/routes/run.js` 中，原先通过以下代码在 Node.js 退出时清理子进程：
```javascript
function cleanupRunJobs() {
  for (const job of runJobs.values()) {
    if (['starting', 'running', 'stopping'].includes(job.status)) {
      terminateJob(job, 'SIGTERM');
    }
  }
}
process.once('exit', cleanupRunJobs);
```
但在 Node.js 规范中，**`exit` 事件的处理器函数必须且只能执行同步操作**。一旦触发 `exit`，事件循环会立即终止并退出进程。由于 `terminateJob` 内部包含异步的 `Promise` 链和 `await killProcessTree(pid)`，该异步操作还没来得及向子进程发送信号，主进程就已强制退出，导致由 Sidecar 拉起的前端开发服务（如 Webpack/Vite 进程）全部沦为孤儿进程。

### 2.2 Rust 侧（Tauri）主进程退出时未关闭 Sidecar
Tauri 启动 Node Sidecar 后将其放入 `SidecarState` 中。但在 Tauri 主进程退出（例如应用关闭、热编译更新、托盘退出等）时，未对 Sidecar 进程执行任何 `kill()` 关闭动作，导致 Node Sidecar 本身也经常沦为后台残留的孤儿进程，不仅霸占 13456 WebSocket 端口，还引发后续新实例启动时的冲突。

---

## 3. 解决方案与修改计划

为了保证应用生命周期的级联清理流，实现“主程序退出，开发服务全数切断”，采取以下双重防线治理方案：

### 3.1 级联同步进程组强杀 (Node.js 侧)
在 `sidecar/routes/run.js` 中：
1. 废弃异步的 `cleanupRunJobs` 清理函数，重构为完全同步执行的 `cleanupRunJobsSync`。
2. 利用 macOS/Unix 下以 `detached: true` 启动的子进程会自成一个**进程组 (Process Group)** 的特性，通过完全同步的 `process.kill(-job.pid, 'SIGKILL')` 接口（PID 前加负号）向整个子进程组广播 `SIGKILL` 强制信号，在微秒级时间内同步肃清包括 Webpack/Vite/Node 孙子进程在内的整条进程链，防范残留。
3. 将该同步函数同步绑定到 Node 进程的 `SIGTERM`, `SIGINT`, `exit` 事件上。

### 3.2 Rust 侧优雅关闭 Sidecar (Tauri 主进程)
在 `src-tauri/src/lib.rs` 中：
1. 拦截 Tauri 的全局退出事件 `tauri::RunEvent::Exit`。
2. 在该事件处理器中，执行同步清理方法 `cleanup_sidecar`：先通过命令行向 Node Sidecar 子进程同步发送优雅退出信号 `kill -TERM <pid>`，给 Node 侧留出 `600ms` 的窗口期来同步执行 `cleanupRunJobsSync` 进程组肃清；随后执行 `child.kill()` (SIGKILL) 兜底关闭，确保 Node 进程本身绝对被终结。

### 3.3 极端崩溃/强杀/闪退场景下的父子存活守护 (Tauri-Sidecar)
在系统性崩溃、闪退或应用被 `kill -9` 强行终止的非正常退出场景下，Rust 主进程无法执行任何退出钩子。为应对此场景，在 [sidecar/index.js](file:///Users/ldy/personalTools/devtools-desktop/sidecar/index.js#L363) 中引入了**反向主动轮询守护定时器**：
- **存活心跳**：Node Sidecar 启动后，以 `1.2s` 的间隔持续对父进程（Tauri）的存活状态进行检测。
- **孤儿判定自尽**：在 macOS/Linux 等 Unix 环境中，一旦父进程被销毁，子进程的 `ppid`（Parent PID）在操作系统内核层面会自动变更为 `1`（被 `launchd` 或 `init` 进程领养）。定时器一经检测到 `process.ppid === 1`，判定主程序已发生非正常关闭，Sidecar 会立即调用 `process.exit(1)` 执行自我了断。
- 自我了断会同步触发 Node 的 `exit` 监听器，进而调用 `cleanupRunJobsSync` 进程组强杀机制，确保即使在软件闪退下，下面的子项目服务也绝对能被全部同步断开。

---

## 4. 验证计划
1. 在“本地运行”页面启动一个前端项目（例如“康展”项目，端口设为 8080）。
2. 在浏览器中访问 `http://localhost:8080`，确保能正常加载。
3. **验证多场景下的级联退出与肃清**：
   - **更新重启/托盘退出验证**：点击“设置”页面中的“重新打包并更新”按钮，或者在托盘点击“退出”。
   - **常规 Cmd+Q 退出验证**：在软件激活状态下，使用键盘组合键 `Cmd+Q` 退出软件。
   - **极端崩溃/强杀验证**：运行终端命令直接强行杀死 Tauri 主进程（例如 `killall app` 或是对 Tauri 主程序进程 PID 执行 `kill -9`）。
4. **预期表现**：
   - 当软件在上述任何场景退出后，在浏览器中刷新 `http://localhost:8080` 应当提示“无法访问此网站”，验证孤儿项目进程已被彻底终清。
   - 运行 `lsof -i tcp:8080` 或 `lsof -i tcp:13456`，应当没有任何进程占用输出，验证服务端口和 Sidecar 端口已完全释放。
   - 重新打开软件后，“本地运行”页面中项目卡片状态成功恢复为“启动运行”的就绪状态，前后端状态达成绝对一致。
5. 通过回车或上下箭头按钮能进行焦点轮巡跳转。
