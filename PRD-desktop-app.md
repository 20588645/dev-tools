# DevTools Desktop — Mac 桌面应用 PRD

> **版本**: v1.0  
> **日期**: 2026-05-13  
> **状态**: 待审核  
> **目标**: 将 Deploy Panel + Git Weekly Report 合并为一个轻量级 Mac 桌面应用

---

## 一、项目背景

### 1.1 现状

目前有两个独立的 Web 工具：

| 工具 | 技术 | 启动方式 | 端口 |
|------|------|---------|------|
| Deploy Panel | Node.js + Express | `npm start` | 3456 |
| Git Weekly Report | Python 3 | `python3 git_report_app.py` | 9966 |

每次使用需要：
1. 打开终端，手动启动服务
2. 打开浏览器访问对应端口
3. 用完后手动关闭进程

### 1.2 目标

做成一个 **Mac 原生桌面应用**（.app），实现：
- Dock 栏点击直接打开，无需终端操作
- 两个功能整合在同一个应用内，侧边栏切换
- 内存占用尽量低（目标空载 < 80MB）
- 支持系统托盘常驻、原生通知
- 打包为标准 .app，可拖入 Applications 文件夹

---

## 二、技术方案

### 2.1 选型：Tauri + Node Sidecar

```
┌──────────────────────────────────────────────┐
│              Tauri 主进程 (Rust)              │
│  - 窗口管理、系统托盘、原生菜单、通知         │
│  - 启动/管理 Node sidecar 子进程             │
│  - 约 3MB 内存                               │
├──────────────────────────────────────────────┤
│           系统 WebKit (WebView)               │
│  - 渲染前端 UI                               │
│  - 约 25-30MB 内存（共享系统 WebKit）         │
├──────────────────────────────────────────────┤
│           前端 UI (HTML/CSS/JS)               │
│  - 侧边栏导航：部署面板 / 周报工具 / 设置     │
│  - 复用现有前端代码，统一视觉风格             │
├──────────────────────────────────────────────┤
│          Node.js Sidecar 子进程               │
│  - Express HTTP 服务（内部通信）              │
│  - WebSocket 实时日志推送                     │
│  - ssh2 SFTP 部署引擎                        │
│  - GitLab API 代理                           │
│  - 约 40-50MB 内存                           │
└──────────────────────────────────────────────┘
```

### 2.2 为什么选 Tauri + Sidecar

| 考量 | 说明 |
|------|------|
| 内存低 | 使用系统 WebKit，非 Chromium，空载约 50-80MB |
| 迁移成本低 | 现有 Node.js 后端代码（ssh2、builder、deployer）直接复用 |
| 包体小 | 最终 .app 约 25-35MB（不含 node_modules 的话更小） |
| 原生体验 | macOS 原生窗口、菜单栏、通知中心、托盘图标 |
| Rust 代码量极少 | 只需写启动 sidecar + IPC 胶水代码 |

### 2.3 内存预算

| 组件 | 预估内存 |
|------|---------|
| Tauri 主进程 | 3-5MB |
| WebKit WebView | 25-35MB |
| Node Sidecar（空闲） | 35-45MB |
| Node Sidecar（构建中） | 60-100MB（临时） |
| **总计（空闲态）** | **65-85MB** |

### 2.4 依赖清单

**Rust/Tauri 侧：**
- tauri ^2.x（应用框架）
- tauri-plugin-shell（sidecar 管理）
- tauri-plugin-notification（系统通知）
- tauri-plugin-autostart（开机启动，可选）

**Node Sidecar 侧（复用现有）：**
- express ^4.18
- ws ^8.16
- ssh2 ^1.15
- glob ^10.0
- uuid ^9.0
- js-yaml ^4.1（替代 Python 的 yaml 处理）

**前端：**
- 无框架，原生 HTML/CSS/JS（复用现有）

---

## 三、应用结构设计

### 3.1 目录结构

```
devtools-desktop/
├── src-tauri/                    # Tauri/Rust 层
│   ├── Cargo.toml
│   ├── tauri.conf.json           # Tauri 配置（窗口、sidecar、权限）
│   ├── src/
│   │   ├── main.rs               # Rust 入口：启动 sidecar、窗口管理
│   │   └── lib.rs                # IPC 命令（可选）
│   ├── icons/                    # 应用图标（icns）
│   └── binaries/                 # Node sidecar 打包产物
├── src/                          # 前端 UI
│   ├── index.html                # 主页面（侧边栏 + 内容区）
│   ├── css/
│   │   └── style.css             # 统一样式
│   └── js/
│       ├── app.js                # 主逻辑 + 路由
│       ├── deploy/               # 部署面板模块
│       │   ├── dashboard.js
│       │   ├── servers.js
│       │   └── history.js
│       ├── report/               # 周报工具模块
│       │   └── report.js
│       ├── api.js                # HTTP 请求封装
│       └── websocket.js          # WebSocket 客户端
├── sidecar/                      # Node.js 后端（sidecar）
│   ├── package.json
│   ├── index.js                  # 入口：Express + WebSocket
│   ├── routes/
│   │   ├── projects.js           # 项目管理 API
│   │   ├── servers.js            # 服务器管理 API
│   │   ├── deploy.js             # 构建 & 部署 API
│   │   ├── history.js            # 部署历史 API
│   │   └── report.js             # 周报生成 API（从 Python 迁移）
│   ├── services/
│   │   ├── scanner.js            # 项目扫描引擎
│   │   ├── builder.js            # 构建引擎
│   │   ├── deployer.js           # SFTP 部署引擎
│   │   ├── crypto.js             # AES 加密
│   │   └── gitlab.js             # GitLab API 封装（从 Python 迁移）
│   └── data/                     # 运行时数据
│       ├── projects.json
│       ├── servers.json
│       ├── history.json
│       ├── report-config.json    # 周报配置（从 YAML 迁移为 JSON）
│       └── .secret
├── package.json                  # 根 package.json（开发脚本）
└── README.md
```

### 3.2 UI 布局

```
┌─────────────────────────────────────────────────┐
│  DevTools                          ─  □  ✕     │
├──────────┬──────────────────────────────────────┤
│          │                                      │
│  🚀      │                                      │
│  部署面板 │      [当前模块的内容区域]              │
│          │                                      │
│  📋      │                                      │
│  Git周报  │                                      │
│          │                                      │
│          │                                      │
│          │                                      │
│  ─────── │                                      │
│  ⚙️      │                                      │
│  设置    │                                      │
│          │                                      │
└──────────┴──────────────────────────────────────┘
```

### 3.3 功能模块划分

| 模块 | 功能 | 来源 |
|------|------|------|
| 部署面板 | 项目总览、模块构建、SFTP 部署、服务器管理、部署历史 | Deploy Panel 全部功能 |
| Git 周报 | 多仓库 commit 聚合、周报/日报生成、Markdown 导出 | Git Weekly Report 全部功能 |
| 设置 | GitLab Token、扫描根目录、通知偏好、开机启动 | 两个项目的配置合并 |

---

## 四、实施步骤

### Phase 1：项目初始化 + Tauri 壳搭建

**目标：** 空窗口能跑起来，验证 Tauri 环境

**步骤：**

1. 安装 Tauri 开发环境
   ```bash
   # Rust 工具链
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   
   # Tauri CLI
   cargo install tauri-cli
   
   # 验证
   cargo tauri --version
   ```

2. 创建项目骨架
   ```bash
   mkdir devtools-desktop && cd devtools-desktop
   cargo tauri init
   ```

3. 配置 `tauri.conf.json`
   - 窗口大小：1200 x 800
   - 最小尺寸：900 x 600
   - 标题：DevTools
   - 绑定前端目录：`../src`

4. 创建最小前端页面（侧边栏 + 空内容区）

5. 验证：`cargo tauri dev` 能打开窗口

**产出：** 可运行的空壳应用

---

### Phase 2：Node Sidecar 配置

**目标：** Tauri 启动时自动拉起 Node 后端进程

**步骤：**

1. 在 `sidecar/` 目录初始化 Node 项目
   ```bash
   cd sidecar && npm init -y
   npm install express ws ssh2 glob uuid js-yaml
   ```

2. 创建 `sidecar/index.js` — 合并后的 Express 入口
   - 端口使用随机可用端口（避免冲突）
   - 启动后将端口号输出到 stdout，供 Tauri 主进程读取

3. 配置 Tauri sidecar
   - `tauri.conf.json` 中声明 sidecar binary
   - 使用 `pkg` 或 `nexe` 将 Node 项目打包为单个可执行文件
   - 或者：bundle 时内嵌 Node runtime + sidecar 源码

4. Rust 侧实现：
   - 应用启动时 spawn sidecar 进程
   - 读取 stdout 获取端口号
   - 应用退出时 kill sidecar 进程
   - 健康检查：定期 ping sidecar，崩溃时自动重启

5. 前端通过 `http://localhost:{port}` 与 sidecar 通信

**产出：** 应用启动时 Node 后端自动运行，前端能调通 API

---

### Phase 3：迁移部署面板功能

**目标：** Deploy Panel 的全部功能在桌面应用中可用

**步骤：**

1. 将 `deploy-panel/server/routes/` 和 `deploy-panel/server/services/` 复制到 `sidecar/`

2. 将 `deploy-panel/public/` 的前端代码迁移到 `src/`
   - 调整为模块化结构（按功能拆分 JS 文件）
   - 适配侧边栏布局

3. 保留所有现有功能：
   - 项目扫描 & 模块探测
   - NVM Node 版本切换
   - 多模块选择性构建
   - SFTP 部署（folder/root 策略）
   - WebSocket 实时日志
   - 远程目录浏览
   - 部署历史 & 自动整理
   - 服务器管理 & FileZilla 导入
   - 任务恢复（页面刷新/重启后恢复）
   - 快速复用

4. 适配桌面特性：
   - 构建/部署完成后发送 macOS 原生通知（替代浏览器 Notification）
   - 窗口关闭时最小化到托盘（而非退出）

**产出：** 部署面板功能完整可用

---

### Phase 4：迁移周报功能（Python → Node.js）

**目标：** Git Weekly Report 功能在桌面应用中可用，不再依赖 Python

**步骤：**

1. 创建 `sidecar/services/gitlab.js` — GitLab API 封装
   ```javascript
   // 核心逻辑从 git_report_app.py 的 fetch_commits() 迁移
   // - 调用 GitLab Commits API
   // - 分页获取
   // - 过滤 merge commit
   // - 按日期/作者分组
   ```

2. 创建 `sidecar/routes/report.js` — 周报 API
   - `GET /api/report/config` — 读取周报配置
   - `POST /api/report/config` — 保存周报配置
   - `POST /api/report/generate` — 生成周报数据
   - `POST /api/report/generate-single` — 单仓库生成（增量加载）
   - `POST /api/report/export` — 导出 Markdown 文件

3. 配置存储从 YAML 迁移为 JSON（统一数据格式）
   - 兼容导入旧的 `git-report-config.yaml`

4. 前端迁移：
   - 将 `git_report.html` 中的 UI 拆分到 `src/js/report/` 模块
   - 适配侧边栏布局和统一样式
   - 保留所有 v2.1 功能：
     - 一键生成摘要
     - commit 搜索/过滤
     - 按日汇总视图
     - 配置导入/导出
     - 增量加载
     - commit 类型标签

**产出：** 周报功能完整可用，不再依赖 Python 环境

---

### Phase 5：统一 UI 与交互优化

**目标：** 两个模块视觉统一，交互流畅

**步骤：**

1. 统一设计语言
   - 暗色主题（复用 Deploy Panel 现有风格）
   - 统一按钮、表单、弹窗、Toast 组件
   - 侧边栏图标 + 文字，支持折叠为纯图标模式

2. 统一设置页
   - GitLab Token（周报用）
   - 项目扫描根目录（部署用）
   - 通知偏好（开/关）
   - 开机自启动（开/关）
   - 数据目录位置

3. 系统托盘
   - 应用图标常驻菜单栏
   - 右键菜单：显示窗口 / 退出
   - 部署任务进行中时图标显示进度指示

4. 快捷键
   - `Cmd+1` 切换到部署面板
   - `Cmd+2` 切换到周报工具
   - `Cmd+,` 打开设置
   - `Cmd+W` 关闭窗口（最小化到托盘）
   - `Cmd+Q` 完全退出

5. 窗口行为
   - 记住上次窗口位置和大小
   - 关闭窗口 = 隐藏（后台继续运行）
   - Dock 图标点击 = 重新显示窗口

**产出：** 统一、流畅的桌面应用体验

---

### Phase 6：打包与分发

**目标：** 生成可直接使用的 .app 文件

**步骤：**

1. 应用图标设计
   - 制作 1024x1024 图标
   - 生成 .icns 文件（macOS 图标格式）

2. Node Sidecar 打包
   - 方案 A：使用 `pkg` 将 Node 项目编译为单个二进制文件（推荐）
     ```bash
     npx pkg sidecar/index.js --target node18-macos-arm64 --output sidecar-bin
     ```
   - 方案 B：bundle 内嵌 Node runtime + 源码

3. Tauri 打包
   ```bash
   cargo tauri build
   ```
   产出：`target/release/bundle/macos/DevTools.app`

4. 代码签名（可选，个人使用可跳过）
   - 无签名时首次打开需要「系统偏好设置 → 安全性」中允许

5. 创建 DMG 安装包（可选）
   - 拖拽安装体验

**产出：** 可分发的 DevTools.app

---

## 五、数据迁移策略

从现有两个项目迁移到桌面应用时，需要处理已有数据：

| 数据 | 来源 | 迁移方式 |
|------|------|---------|
| servers.json | deploy-panel/server/data/ | 直接复制到新 data 目录 |
| projects.json | deploy-panel/server/data/ | 直接复制 |
| history.json | deploy-panel/server/data/ | 直接复制 |
| .secret | deploy-panel/server/data/ | 直接复制（加密密钥） |
| git-report-config.yaml | git-weekly-report/ | 首次启动时自动转换为 JSON |

桌面应用的数据目录位置：
```
~/Library/Application Support/DevTools/
├── projects.json
├── servers.json
├── history.json
├── report-config.json
└── .secret
```

首次启动时检测旧数据并提示导入。

---

## 六、与现有 Web 版的关系

桌面应用发布后：
- **Deploy Panel Web 版** — 保留，作为备用方案（如远程访问场景）
- **Git Weekly Report Web 版** — 保留，但日常使用切换到桌面版
- 两个 Web 版项目不再主动维护新功能，新功能只在桌面版开发

---

## 七、风险与注意事项

| 风险 | 影响 | 应对 |
|------|------|------|
| Node sidecar 打包后体积较大 | .app 可能达到 60-80MB | 可接受，或用 tree-shaking 精简依赖 |
| ssh2 原生模块编译 | 打包时可能遇到 native addon 问题 | 使用 prebuild 或在目标平台编译 |
| macOS 安全限制 | 未签名 app 首次打开被拦截 | 提示用户右键打开，或后续申请开发者证书 |
| Sidecar 端口冲突 | 启动失败 | 使用随机端口 + 重试机制 |
| WebKit 兼容性 | 部分 CSS/JS 特性在 WebKit 中表现不同 | 开发时用 Safari 测试，避免 Chrome-only 特性 |

---

## 八、后续扩展（v2.0 规划）

以下功能不在 v1.0 范围内，但架构设计时预留扩展性：

- **插件系统** — 支持添加更多开发工具模块
- **多项目工作区** — 支持切换不同的项目扫描根目录
- **部署模板** — 保存常用的部署配置组合，一键执行
- **周报 AI 摘要** — 接入 LLM 自动生成周报文案
- **团队协作** — 共享服务器配置和部署记录（需要后端服务）
- **自动更新** — 应用内检测新版本并自动更新

---

## 九、验收标准

v1.0 完成时需满足：

1. ✅ 双击 .app 即可启动，无需终端操作
2. ✅ 部署面板全部功能正常（构建、部署、历史、服务器管理）
3. ✅ 周报工具全部功能正常（多仓库聚合、导出 Markdown）
4. ✅ 空闲内存占用 < 100MB
5. ✅ 应用包体 < 80MB
6. ✅ 支持系统托盘常驻
7. ✅ 构建/部署完成后发送 macOS 原生通知
8. ✅ 窗口关闭后后台继续运行
9. ✅ 首次启动可导入旧数据
10. ✅ 支持 macOS 12+ (Monterey 及以上)
