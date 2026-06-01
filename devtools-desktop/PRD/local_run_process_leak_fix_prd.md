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

---

## 4. 验证计划
1. 在“本地运行”页面启动一个前端项目（例如“康展”项目，端口设为 8080）。
2. 在浏览器中访问 `http://localhost:8080`，确保能正常加载。
3. 点击“设置”页面中的“重新打包并更新”按钮执行热编译更新（或者在托盘点击“退出”）。
4. **验证结果**：
   - 验证服务关闭：当软件退出后，在浏览器中刷新 `http://localhost:8080` 应当提示“无法访问此网站”（验证孤儿服务进程已被同步肃清）。
   - 验证端口释放：运行 `lsof -i tcp:8080` 或 `lsof -i tcp:13456`，应该无任何 PID 占用输出，验证端口完全释放。
   - 验证状态一致性：重新打开软件后，本地运行页面中该项目卡片的状态为“启动运行”的初始状态，前后端状态达成完全的统一。
