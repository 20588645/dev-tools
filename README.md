# DevTools Desktop

> 轻量级 Mac 桌面开发工具集，整合前端项目构建部署和 Git 周报生成。

![Platform](https://img.shields.io/badge/platform-macOS-blue)
![Tech](https://img.shields.io/badge/tech-Tauri%20%2B%20Node.js-purple)
![Version](https://img.shields.io/badge/version-0.1.0-green)

基于 Tauri 2.x + Node.js Sidecar 架构，双击 .app 即可使用，无需终端操作。

## ✨ 功能特性

### 🚀 部署面板

- **项目自动扫描** — 自动检测项目类型（Webpack / Vite / parallel-webpack），识别多模块结构
- **多模块选择性构建** — 支持 parallel-webpack 多入口项目，可选择性构建指定模块
- **Node 版本切换** — 集成 NVM，按项目记忆 Node 版本，构建时自动切换
- **SFTP 一键部署** — 构建产物自动上传到远程服务器，支持 folder / root 两种上传策略
- **实时构建日志** — 基于 WebSocket 推送，构建和上传过程实时可见
- **远程目录浏览** — 内置远程文件浏览器，可视化查看服务器文件结构
- **部署历史记录** — 完整记录每次构建/部署的状态、耗时、日志
- **服务器管理** — 支持多服务器管理，多发布路径配置
- **模块收藏** — 常用模块标记收藏，快速选择

### ▶ 本地运行

- **一键启动** — 快速启动前端开发服务，自动检测启动命令
- **模块管理** — 多模块项目可选择性运行指定模块
- **实时日志** — WebSocket 推送运行日志，编译错误即时通知
- **状态监控** — 运行中项目状态一目了然

### 📋 Git 周报

- **多仓库聚合** — 同时配置多个 GitLab 仓库，一键拉取指定时间范围内的 commit 记录
- **智能分类** — 自动解析 feat/fix/refactor 等 commit 前缀，彩色标签展示
- **Markdown 导出** — 生成结构化 Markdown 报告，支持复制到剪贴板
- **按仓库/日期分组** — 灵活的数据展示方式
- **配置持久化** — Token、作者名、仓库列表自动保存

### ⚙️ 通用

- **侧边栏导航** — 多功能模块统一管理，支持折叠
- **全局搜索** — `Cmd+K` 快速搜索项目、服务器、操作
- **服务状态监控** — 实时查看后端服务运行状态和日志
- **macOS 原生通知** — 构建/部署完成后发送系统通知
- **快捷键** — `Cmd+1` 部署面板、`Cmd+2` 周报、`Cmd+,` 设置

## 🛠 技术栈

| 层 | 技术 |
|------|------|
| 应用框架 | Tauri 2.x (Rust) |
| 后端服务 | Node.js + Express (Sidecar 模式) |
| 前端 | 原生 HTML/CSS/JS（零框架依赖） |
| 实时通信 | WebSocket (ws) |
| 远程连接 | ssh2（SFTP 上传 + SSH 连接测试） |
| 加密 | AES-256-GCM（服务器密码加密存储） |
| 数据存储 | 本地 JSON 文件 |

## 📦 安装 & 启动

### 环境要求

- macOS 12+ (Monterey 及以上)
- Node.js 18+
- Rust 工具链（开发时需要）
- NVM（可选，用于 Node 版本切换）

### 开发模式

```bash
# 克隆项目
git clone https://gitee.com/ldy1103/dev-tools.git
cd dev-tools/devtools-desktop

# 安装 sidecar 依赖
cd sidecar && npm install && cd ..

# 开发运行
cargo tauri dev
```

### 构建发布

```bash
# 构建 .app 和 .dmg
cargo tauri build

# 产出位置
# src-tauri/target/release/bundle/macos/DevTools.app
# src-tauri/target/release/bundle/dmg/DevTools_0.1.0_aarch64.dmg
```

### 安装到 Applications

```bash
cp -R src-tauri/target/release/bundle/macos/DevTools.app /Applications/
```

## 📁 项目结构

```
devtools-desktop/
├── src/                          # 前端 UI
│   ├── index.html                # 主页面
│   ├── css/style.css             # 全局样式
│   └── js/
│       ├── app.js                # 核心业务逻辑
│       ├── api.js                # HTTP 请求封装
│       └── websocket.js          # WebSocket 客户端
├── sidecar/                      # Node.js 后端
│   ├── index.js                  # Express + WebSocket 入口
│   ├── routes/
│   │   ├── projects.js           # 项目管理 API
│   │   ├── servers.js            # 服务器管理 API
│   │   ├── deploy.js             # 构建 & 部署 API
│   │   ├── history.js            # 部署历史 API
│   │   ├── run.js                # 本地运行 API
│   │   └── report.js             # 周报生成 API
│   ├── services/
│   │   ├── scanner.js            # 项目扫描引擎
│   │   ├── builder.js            # 构建引擎（支持 NVM）
│   │   ├── deployer.js           # SFTP 部署引擎
│   │   ├── crypto.js             # AES 加密/解密
│   │   └── gitlab.js             # GitLab API 封装
│   └── data/                     # 运行时数据
├── src-tauri/                    # Tauri/Rust 层
│   ├── src/lib.rs                # 主进程（启动 sidecar）
│   ├── tauri.conf.json           # 应用配置
│   └── icons/                    # 应用图标
└── design-references/            # 设计参考稿
```

## 🔧 架构说明

```
┌─────────────────────────────────────┐
│        Tauri 主进程 (Rust)          │  窗口管理、启动 sidecar
├─────────────────────────────────────┤
│       系统 WebKit (WebView)         │  渲染前端 UI
├─────────────────────────────────────┤
│       前端 (HTML/CSS/JS)            │  用户交互界面
├─────────────────────────────────────┤
│     Node.js Sidecar 子进程          │  业务逻辑、SSH/SFTP、GitLab API
└─────────────────────────────────────┘
```

应用启动时，Tauri 主进程自动 spawn Node sidecar 子进程，前端通过 HTTP + WebSocket 与 sidecar 通信。关闭应用时 sidecar 随之退出。

## ⚡ 性能

| 指标 | 数值 |
|------|------|
| 空闲内存 | ~160MB |
| 空闲 CPU | 0% |
| 应用包体 | ~15MB（不含 node_modules） |
| 启动时间 | < 2s |

## ⚠️ 注意事项

- 本工具定位为**个人开发工具**，仅绑定 127.0.0.1 本机访问
- 服务器密码经 AES-256-GCM 加密后存储，密钥保存在 `sidecar/data/.secret`
- 首次启动会自动生成加密密钥，请勿删除 `.secret` 文件
- 未签名应用首次打开需要在「系统设置 → 隐私与安全性」中允许

## 📌 历史版本

早期的两个独立 Web 工具（deploy-panel、git-weekly-report）已归档至 `archive/web-standalone` 分支。

## 📄 License

MIT
