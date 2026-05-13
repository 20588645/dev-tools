# 🚀 Deploy Panel — 轻量级前端部署面板 PRD

> **版本**: v1.0  
> **日期**: 2026-05-09  
> **状态**: 待实施

---

## 一、项目背景

### 1.1 当前痛点

公司有 40+ 前端项目集中在 `/Users/ldy/project/` 下，没有配置 Jenkins，每次发布需要：

1. 手动执行 `npm run build [模块名]`
2. 打开 FileZilla 连接服务器
3. 手动将 dist 目录中的文件上传到对应的服务器路径
4. 人工确认是否覆盖正确

**痛点汇总**：流程繁琐、易出错、无发布记录、效率低下、协作困难。

### 1.2 项目目标

构建一个 **Web UI 部署面板**，提供类似 Jenkins 的网页操作体验：
- 打开浏览器即可操作，无需命令行
- 支持 **分模块构建 + 分模块发布**
- 使用 **SFTP 逐文件上传**（与 FileZilla 完全一致的效果）
- 实时显示构建日志和上传进度

---

## 二、项目现状分析

### 2.1 项目分类

经过代码分析，项目分为两类：

#### 多模块项目（parallel-webpack 多入口架构）

| 项目 | 模块数 | 构建命令 |
|------|--------|----------|
| kangzhan-cloud | 26 个 | `npm run build [模块名...]` |
| inz-pc | 17 个 | `npm run build [模块名...]` |
| jms-pc | 16 个 | `npm run build [模块名...]` |
| ss-pc | ~10 个 | `npm run build [模块名...]` |
| tongrentang | 类似结构 | `npm run build [模块名...]` |
| moutai-jt | 6 个 | `npm run build [模块名...]` |

**构建机制**（从 webpack.base.conf.js 分析得出）：
- `src/` 下每个含 `main.js` 的子目录是一个独立模块
- 通过 `process.argv.slice(2)` 接收模块名参数
- 不传参数时构建所有模块（排除 `config.exludeModules` 中的模块）
- 产物输出到 `dist/[模块名]/` 目录
- 使用 `parallel-webpack` 并行构建

**excludeModules 示例**（inz-pc/config/index.js）：
```javascript
exludeModules: [
  'userAudit', 'wisdomPark', 'transAging', 'linkTrack',
  'common', 'test', 'gtp', 'jlp', 'custom', 'exception',
  'router', 'store', 'structure', 'tmp', 'temperatureControl',
  'weiAdmin', 'App', 'main', 'login'
]
```

#### 单体项目

| 项目 | 构建工具 | 构建命令 |
|------|----------|----------|
| netaxfront | Vite | `npm run build` |
| emergency-web | Vue CLI | `npm run build:prod` |
| inz-web-portal | Vite | `npm run build` |
| moutai-wl | Webpack | `npm run build` |
| 其他 | 各种 | `npm run build` |

### 2.2 上传策略（⭐ 关键）

> [!IMPORTANT]
> 不同模块有不同的上传方式，这是核心差异点。

#### 策略 A: `folder` — 整文件夹覆盖（默认）

适用于大多数普通模块（如 operatingOAS）：

```
本地 dist/operatingOAS/         →  服务器 /var/www/xxx/operatingOAS/
├── css/                        →  /var/www/xxx/operatingOAS/css/
├── js/                         →  /var/www/xxx/operatingOAS/js/
├── index.html                  →  /var/www/xxx/operatingOAS/index.html
└── runtime.xxx.js              →  /var/www/xxx/operatingOAS/runtime.xxx.js
```

**整个文件夹直接上传到服务器对应子目录，覆盖同名文件。**

#### 策略 B: `root` — 内容散开到根目录

适用于 home 模块：

```
本地 dist/home/                 →  服务器根目录 /var/www/xxx/
├── css/                        →  /var/www/xxx/css/       （不是 /home/css/）
├── js/                         →  /var/www/xxx/js/
├── index.html                  →  /var/www/xxx/index.html
└── runtime.xxx.js              →  /var/www/xxx/runtime.xxx.js
```

**将 dist/home/ 内的所有文件/文件夹散开上传到远程根路径，而非放进 home/ 子目录。**

#### 上传协议

- **必须使用 SFTP 逐文件上传**（与 FileZilla 完全一致）
- **不使用 tar.gz 打包**（服务器无解压功能）
- 上传时覆盖同名文件，自动创建不存在的目录

---

## 三、技术选型

| 层 | 技术 | 版本 | 选型理由 |
|----|------|------|----------|
| 后端框架 | **Express** | 4.x | 已有 Node 环境，零额外安装 |
| 实时日志 | **ws** | 8.x | WebSocket，构建/部署日志实时推送 |
| SSH/SFTP | **ssh2** | 1.x | 纯 JS SSH2 客户端，内置 SFTP |
| 数据存储 | **JSON 文件** | — | 无需数据库 |
| 凭据加密 | **crypto (内置)** | — | AES-256-GCM 加密服务器密码 |
| 前端 | **原生 HTML + CSS + JS** | — | 零构建，Express 静态托管 |

### 为什么不用 React/Vue？

前端页面逻辑简单（项目列表 + 弹窗 + 日志），原生 JS 完全够用，省去构建步骤，`npm start` 即用。

### npm 依赖清单

```json
{
  "dependencies": {
    "express": "^4.18.0",
    "ws": "^8.16.0",
    "ssh2": "^1.15.0",
    "glob": "^10.0.0",
    "uuid": "^9.0.0"
  }
}
```

---

## 四、目录结构

```
deploy-panel/
├── PRD/                          # 需求文档
│   └── deploy-panel-prd.md       # 本文档
├── deploy-panel-mockup/          # UI 效果演示（保留参考）
│   ├── index.html
│   ├── style.css
│   └── app.js
├── server/
│   ├── app.js                    # Express + WebSocket 主入口
│   ├── routes/
│   │   ├── projects.js           # 项目扫描 & 模块探测 API
│   │   ├── servers.js            # 服务器配置 CRUD API
│   │   ├── deploy.js             # 构建 & 部署 API
│   │   └── history.js            # 部署历史 API
│   ├── services/
│   │   ├── scanner.js            # 项目/模块自动扫描引擎
│   │   ├── builder.js            # npm run build 构建引擎
│   │   ├── deployer.js           # SFTP 上传引擎
│   │   └── crypto.js             # 密码加密/解密工具
│   └── data/                     # JSON 数据文件
│       ├── servers.json          # 服务器配置
│       ├── projects.json         # 项目配置（含模块上传策略）
│       └── history.json          # 部署历史
├── public/                       # 前端静态文件
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js
├── package.json
└── README.md
```

---

## 五、核心功能模块

### 5.1 项目扫描 & 模块探测（scanner.js）

**扫描流程**：

```
1. 遍历 /Users/ldy/project/* 目录
2. 检测 package.json 是否存在 → 否则跳过
3. 检测 src/*/main.js 是否存在多个
   ├── 是 → 标记为多模块项目
   │   ├── 枚举所有 src/[name]/main.js 获取模块列表
   │   ├── 读取 config/index.js 中 exludeModules 排除列表
   │   └── 生成可构建模块列表
   └── 否 → 标记为单体项目
4. 推断构建命令：
   ├── scripts.build 存在 → npm run build
   ├── scripts["build:prod"] 存在 → npm run build:prod
   └── 其他 → 需手动配置
5. 推断产物目录：默认 dist/
```

**输出数据结构**：

```json
{
  "name": "kangzhan-cloud",
  "path": "/Users/ldy/project/kangzhan-cloud",
  "type": "multi-module",
  "tool": "Webpack",
  "buildCommand": "npm run build",
  "distDir": "dist",
  "modules": [
    { "name": "home", "uploadStrategy": "root" },
    { "name": "operatingOAS", "uploadStrategy": "folder" },
    { "name": "OMSorderManage", "uploadStrategy": "folder" },
    { "name": "transportAdmin", "uploadStrategy": "folder" }
  ],
  "excludeModules": ["common", "tmp", "structure"],
  "defaultServerId": "server-001",
  "remotePath": "/var/www/kangzhan-cloud/"
}
```

### 5.2 构建引擎（builder.js）

**多模块构建**：
```bash
# 用户选择了 home 和 operatingOAS 两个模块
cd /Users/ldy/project/tongrentang
npm run build home operatingOAS
# 产物: dist/home/  dist/operatingOAS/
```

**单体构建**：
```bash
cd /Users/ldy/project/netaxfront
npm run build
# 产物: dist/
```

**关键实现**：
- 使用 `child_process.spawn` 执行构建命令
- stdout/stderr 通过 WebSocket 实时推送到浏览器
- 捕获退出码判断构建成功/失败

### 5.3 SFTP 部署引擎（deployer.js）

**核心流程**：

```
1. SSH 连接目标服务器（ssh2 库）
2. 建立 SFTP 会话
3. 根据模块的 uploadStrategy 决定上传方式：
   ├── "folder": 递归上传 dist/moduleName/ → remotePath/moduleName/
   └── "root":   递归上传 dist/home/* → remotePath/ （内容散开）
4. 逐文件上传，覆盖同名文件
5. 自动创建远程目录（如不存在）
6. 每个文件上传完成后通过 WebSocket 推送进度
7. 全部完成后断开连接
```

**SFTP 上传伪代码**：

```javascript
async function uploadDirectory(sftp, localDir, remoteDir) {
  const items = fs.readdirSync(localDir);
  for (const item of items) {
    const localPath = path.join(localDir, item);
    const remotePath = path.join(remoteDir, item);
    if (fs.statSync(localPath).isDirectory()) {
      await ensureRemoteDir(sftp, remotePath);
      await uploadDirectory(sftp, localPath, remotePath); // 递归
    } else {
      await sftpUploadFile(sftp, localPath, remotePath);
      wsLog(`✓ ${remotePath}`); // WebSocket 推送
    }
  }
}

// 根据上传策略决定远程路径
if (module.uploadStrategy === 'root') {
  // home 模块: dist/home/* → /var/www/xxx/*
  await uploadDirectory(sftp, `dist/home`, remotePath);
} else {
  // 普通模块: dist/operatingOAS/ → /var/www/xxx/operatingOAS/
  await uploadDirectory(sftp, `dist/${module.name}`, `${remotePath}/${module.name}`);
}
```

### 5.4 WebSocket 实时日志

- 构建日志（stdout/stderr）实时推送
- 上传进度（文件名 + 已上传/总数）实时推送
- 错误信息高亮显示
- 前端使用终端风格展示（JetBrains Mono 字体，暗色背景）

---

## 六、API 设计

### 6.1 项目相关

| Method | Path | 功能 |
|--------|------|------|
| GET | `/api/projects` | 获取所有项目列表 |
| GET | `/api/projects/:name` | 获取单个项目详情（含模块列表） |
| POST | `/api/projects/scan` | 手动触发重新扫描 |
| PUT | `/api/projects/:name` | 更新项目配置（构建命令、模块上传策略等） |

### 6.2 服务器相关

| Method | Path | 功能 |
|--------|------|------|
| GET | `/api/servers` | 获取所有服务器列表（密码脱敏） |
| POST | `/api/servers` | 添加服务器 |
| PUT | `/api/servers/:id` | 更新服务器信息 |
| DELETE | `/api/servers/:id` | 删除服务器 |
| POST | `/api/servers/:id/test` | 测试服务器连接 |

### 6.3 部署相关

| Method | Path | 功能 |
|--------|------|------|
| POST | `/api/deploy/build` | 仅构建（不上传） |
| POST | `/api/deploy/start` | 构建并部署 |

**部署请求体**：
```json
{
  "projectName": "kangzhan-cloud",
  "modules": ["home", "operatingOAS"],
  "serverId": "server-001",
  "remotePath": "/var/www/kangzhan-cloud/"
}
```

### 6.4 部署历史

| Method | Path | 功能 |
|--------|------|------|
| GET | `/api/history` | 获取部署历史列表 |
| GET | `/api/history/:id` | 获取某次部署的详细日志 |

### 6.5 WebSocket

- 路径: `ws://localhost:3456/ws`
- 消息格式: `{ type: 'log'|'progress'|'status', data: ... }`

---

## 七、数据结构

### 7.1 servers.json

```json
[
  {
    "id": "server-001",
    "name": "生产-茅台物流",
    "host": "172.29.121.47",
    "port": 22,
    "username": "root",
    "authType": "password",
    "password": "<AES-256-GCM加密>",
    "defaultRemotePath": "/var/www/"
  }
]
```

### 7.2 projects.json

```json
[
  {
    "name": "kangzhan-cloud",
    "path": "/Users/ldy/project/kangzhan-cloud",
    "type": "multi-module",
    "tool": "Webpack",
    "buildCommand": "npm run build",
    "distDir": "dist",
    "modules": [
      { "name": "home", "uploadStrategy": "root" },
      { "name": "operatingOAS", "uploadStrategy": "folder" },
      { "name": "OMSorderManage", "uploadStrategy": "folder" }
    ],
    "excludeModules": ["common", "tmp", "structure"],
    "defaultServerId": "server-001",
    "remotePath": "/var/www/kangzhan-cloud/"
  },
  {
    "name": "netaxfront",
    "path": "/Users/ldy/project/netaxfront",
    "type": "single",
    "tool": "Vite",
    "buildCommand": "npm run build",
    "distDir": "dist",
    "modules": [],
    "defaultServerId": null,
    "remotePath": ""
  }
]
```

### 7.3 history.json

```json
[
  {
    "id": "deploy-20260509-112000",
    "timestamp": "2026-05-09T11:20:00+08:00",
    "projectName": "kangzhan-cloud",
    "modules": ["home", "OMSorderManage"],
    "serverId": "server-001",
    "serverName": "生产-茅台物流",
    "remotePath": "/var/www/kangzhan-cloud/",
    "status": "success",
    "duration": "2m 30s",
    "logs": ["[构建日志行...]"]
  }
]
```

---

## 八、Web UI 页面

### 8.1 页面清单

| 页面 | 路由 | 功能 |
|------|------|------|
| Dashboard | `/` | 项目卡片总览，搜索筛选 |
| 模块选择弹窗 | 弹窗 | 勾选模块 + 选服务器 + 配置远程路径 |
| 部署日志弹窗 | 弹窗 | 实时日志 + 进度条 + 分阶段状态 |
| 服务器管理 | Tab | 增删改查服务器 + 测试连接 |
| 部署历史 | Tab | 历史记录表格 + 查看日志 |

### 8.2 UI 设计参考

**效果演示文件已保留**，位置：

```
/Users/ldy/project/deploy-panel/deploy-panel-mockup/
├── index.html    ← 浏览器直接打开即可查看
├── style.css     ← 暗色主题，可直接复用
└── app.js        ← 交互逻辑参考
```

> 实际开发时前端样式从 mockup 中复用，放到 `public/` 目录下。

### 8.3 关键 UI 交互

**模块选择弹窗**：
- 多模块项目：显示模块勾选网格（3列），支持搜索、全选/全不选
- 单体项目：显示"整体构建"提示，无需选模块
- 底部：目标服务器下拉 + 远程路径输入
- 按钮：「仅构建」和「构建并部署」

**部署日志弹窗**：
- 顶部：分阶段进度（构建 → 上传 → 完成）
- 中间：终端风格日志（JetBrains Mono 字体），自动滚动
- 底部：完成状态 + 耗时

---

## 九、安全设计

| 措施 | 实现方式 |
|------|----------|
| 登录认证 | 首次使用设置密码，后续访问需验证 |
| 凭据加密 | 服务器密码使用 AES-256-GCM + 随机 IV 加密存储 |
| 仅本地访问 | Express 绑定 `127.0.0.1:3456`，仅本机可访问 |
| 操作日志 | 所有部署操作记录到 history.json |

---

## 十、实施步骤

### Phase 1: 项目初始化 + 后端核心

1. 初始化 `package.json`，安装依赖
2. 实现 `server/app.js`（Express + WebSocket）
3. 实现 `services/scanner.js`（项目扫描 + 模块探测）
4. 实现 `services/crypto.js`（密码加密）
5. 实现 `routes/projects.js` 和 `routes/servers.js`

### Phase 2: 构建 & 部署引擎

6. 实现 `services/builder.js`（构建引擎 + 日志推送）
7. 实现 `services/deployer.js`（SFTP 上传引擎，两种策略）
8. 实现 `routes/deploy.js` 和 `routes/history.js`

### Phase 3: 前端 UI

9. 从 mockup 迁移样式到 `public/`
10. 实现 Dashboard（项目卡片 + 搜索筛选）
11. 实现模块选择弹窗 + 部署日志弹窗
12. 实现服务器管理页 + 部署历史页
13. WebSocket 日志对接

### Phase 4: 联调测试

14. 端到端测试：扫描 → 构建 → SFTP 上传
15. 异常处理：构建失败、SSH 连接失败、上传中断
16. 细节打磨

---

## 十一、启动方式

```bash
cd /Users/ldy/project/deploy-panel
npm install
npm start
# 浏览器打开 http://localhost:3456
```

---

## 十二、关键约束和注意事项

> [!WARNING]
> 以下是实施中必须严格遵守的约束：

1. **SFTP 逐文件上传**：服务器无解压功能，禁止使用 tar.gz 打包方式
2. **上传策略区分**：home 模块用 `root` 策略（内容散开），其他模块用 `folder` 策略（整文件夹）
3. **模块探测**：通过 `glob.sync(src/*/main.js)` 探测，并排除 `exludeModules` 列表
4. **构建命令参数**：多模块项目通过 `npm run build 模块1 模块2` 传入参数
5. **密码加密存储**：严禁明文存储服务器密码
6. **项目路径**：扫描根目录为 `/Users/ldy/project/`，可配置
