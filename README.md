# DevTools Desktop

个人开发工具集。技术栈是 Tauri 2 + Vue 3 + Vite + Node.js Sidecar，面向 macOS 本地开发、项目运行、部署和开发日志管理。

## 技术结构

```text
Tauri 2 (Rust)
├── frontend/       Vue 3 + Vite + TypeScript + Pinia + Vue Router
├── sidecar/        Node.js + Express + WebSocket + SQLite
└── src-tauri/      窗口、托盘、IPC 与 Sidecar 生命周期
```

前端按页面拆 View / composable / 页面 CSS；业务页只走 `Base*` 与类型化 Service，不直接使用 Naive UI、`fetch` 或 Tauri IPC。Sidecar 是本机 Node 进程（CommonJS，依赖 `node-pty` / `better-sqlite3` 等原生模块），由 Tauri 以 `node sidecar/index.js` 拉起。

## 主要功能

- 项目构建、运行、部署和部署历史
- 本地/远程文件传输与终端
- 工时记录、待办、笔记本、个人笔记和文件编辑器
- IP 纯净检测、双因验证、应用隔离属性修复和 AI 工具用量统计
- 亮色/暗色主题、系统通知、Sidecar 状态与自动更新

## 开发命令

在 `devtools-desktop/` 目录执行：

```bash
npm install
npm run dev              # Vite 浏览器开发服务
npm run typecheck        # TypeScript/Vue 类型检查
npm run lint             # ESLint + Stylelint + 架构门禁
npm run test:unit        # Vitest 单元测试（含 sidecar）
npm run test:e2e         # Playwright 浏览器回归
npm run tauri:dev        # Tauri 桌面开发模式
npm run build            # 前端构建并打包 macOS App
```

Sidecar 依赖首次安装：

```bash
cd sidecar && npm install
```

开发测试时优先使用隔离沙箱：

```bash
DEVTOOLS_TEST=1 node sidecar/index.js
```

## 目录说明

```text
devtools-desktop/
├── frontend/          # Vue 入口、路由、页面和公共组件
├── sidecar/           # REST API、WebSocket、业务服务和 SQLite
├── src-tauri/         # Tauri/Rust 桌面层
├── scripts/           # 版本同步与架构/Token 门禁
├── tests/             # Playwright E2E
└── PRD/               # 长期生效的组件架构规则与 UI 清单
```

## 架构规则

- [组件架构合规](devtools-desktop/PRD/architecture/component-architecture-compliance.md)
- [共享 UI 清单](devtools-desktop/PRD/architecture/shared-ui-inventory.md)

## 数据与安全

- Sidecar 默认只监听 `127.0.0.1`。
- 用户数据保存在 `devtools-desktop/sidecar/data/`，不要提交数据库、密钥或备份文件。
- `dist/`、`src-tauri/target/`、`test-results/` 等均为可再生构建/测试产物，不手工维护。
