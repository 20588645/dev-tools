# DevTools Desktop

> 轻量级 Mac 桌面开发工具集，整合前端项目构建部署和 Git 周报生成。

基于 Tauri 2.x + Node.js Sidecar 架构，双击 .app 即可使用，无需终端操作。

## 功能

- **🚀 部署面板** — 项目扫描、多模块构建、NVM 版本切换、SFTP 一键部署、实时日志、服务器管理、部署历史
- **▶ 本地运行** — 一键启动前端开发服务，管理模块、日志和本地地址
- **📋 Git 周报** — 多仓库 commit 聚合、commit 类型标签、Markdown 导出
- **⚙️ 统一设置** — GitLab Token、扫描目录、仓库配置

## 技术栈

| 层 | 技术 |
|------|------|
| 应用框架 | Tauri 2.x (Rust) |
| 后端 | Node.js + Express (Sidecar) |
| 前端 | 原生 HTML/CSS/JS |
| 实时通信 | WebSocket |
| 远程连接 | ssh2 (SFTP) |
| 加密 | AES-256-GCM |

## 项目结构

```
├── devtools-desktop/     # Mac 桌面应用源码
│   ├── src/              # 前端 UI
│   ├── sidecar/          # Node.js 后端
│   └── src-tauri/        # Tauri/Rust 层
└── PRD-desktop-app.md    # 产品需求文档
```

## 快速开始

```bash
cd devtools-desktop

# 安装后端依赖
cd sidecar && npm install && cd ..

# 开发模式
cargo tauri dev

# 构建 Mac 应用
cargo tauri build

# 安装到 Applications
cp -R src-tauri/target/release/bundle/macos/DevTools.app /Applications/
```

详细文档见 [devtools-desktop/README.md](devtools-desktop/README.md)

## 历史版本

早期的两个独立 Web 工具（deploy-panel、git-weekly-report）已归档至 `archive/web-standalone` 分支。

## License

MIT
