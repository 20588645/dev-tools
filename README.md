# DevTools Desktop

个人开发工具集，使用 Tauri 2 + Vue 3 + Vite + Node.js Sidecar 构建，面向 macOS 本地开发、项目运行、部署和开发日志管理。

## 当前状态

前端正在按页面渐进式迁移到 Vue 3。Vite、TypeScript、Pinia、Vue Router、Vitest 和 Playwright 已接入；迁移期间旧页面仍通过兼容外壳运行，Sidecar API、WebSocket 协议和 SQLite 数据保持兼容。

## 主要功能

- 项目构建、运行、部署和部署历史
- 本地/远程文件传输与终端
- Git 周报、待办、笔记本、个人笔记和文件编辑器
- IP 纯净检测、2FA 账号验证码和 AI 工具用量统计
- 亮色/暗色主题、系统通知、Sidecar 状态与自动更新

## 技术结构

```text
Tauri 2 (Rust)
├── frontend/       Vue 3 + Vite + TypeScript
├── sidecar/        Node.js + Express + WebSocket + SQLite
└── src-tauri/      窗口、托盘、IPC 与 Sidecar 生命周期
```

## 开发命令

在 `devtools-desktop/` 目录执行：

```bash
npm install
npm run dev              # Vite 浏览器开发服务
npm run typecheck       # TypeScript/Vue 类型检查
npm run lint            # ESLint + Stylelint
npm run test:unit       # Vitest 单元测试
npm run test:e2e        # Playwright 浏览器回归
npm run tauri:dev       # Tauri 桌面开发模式
npm run build           # 前端构建并打包 macOS App
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
├── frontend/          # Vue 入口、路由和迁移中的页面组件
├── src/                # 迁移期间保留的旧 CSS、JavaScript 和 vendor 资源
├── sidecar/            # REST API、WebSocket、业务服务和 SQLite
├── src-tauri/          # Tauri/Rust 桌面层
├── scripts/            # 构建、版本同步和质量检查
├── tests/              # 自动化测试
├── PRD/                # 当前迁移计划、测试基线和证据
└── design-preview/     # 当前仍在使用的设计参考与视觉验收素材
```

## 架构迁移文档

- [Vue 3 架构渐进重构执行计划](devtools-desktop/PRD/vue3_architecture_migration_execution_plan.md)
- [Vue 迁移测试基线](devtools-desktop/PRD/vue-migration-test-baseline.md)

重构遵循“逐页研究、用户确认、组件复用、自动化验证、手动 E2E 验收”的流程，不一次性重写所有页面。

## 数据与安全

- Sidecar 默认只监听 `127.0.0.1`。
- 用户数据保存在 `devtools-desktop/sidecar/data/`，不要提交数据库、密钥或备份文件。
- `dist/`、`src-tauri/target/`、`test-results/` 等均为可再生构建/测试产物，不手工维护。
