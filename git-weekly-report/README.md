# Git Weekly Report

> 轻量级 Git 仓库周报/日报生成工具，零依赖，开箱即用。

## ✨ 功能特性

- **多仓库聚合** — 同时配置多个 GitLab 仓库，一键拉取指定时间范围内的 commit 记录
- **周报/日报切换** — 支持周报和日报两种模式，一键切换
- **智能过滤** — 隐藏无提交记录的空仓库，聚焦有效信息
- **仓库搜索** — 快速过滤定位目标仓库
- **拖拽排序** — 拖拽调整仓库显示顺序
- **导出 Markdown** — 生成结构化 Markdown 报告，支持下载和复制到剪贴板
- **配置持久化** — Token、作者名、仓库列表自动保存至 YAML 文件

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | HTML + CSS + JavaScript（单文件，无框架） |
| 后端 | Python 3（标准库 `http.server`，无第三方依赖） |
| 配置 | YAML 文件本地持久化 |

## 🚀 快速开始

### 方式一：双击启动（推荐）

双击项目根目录的 `启动周报.command` 文件，自动启动服务并打开浏览器。

> 首次运行如遇安全提示，右键 → 打开 即可。

### 方式二：命令行启动

```bash
python3 git_report_app.py
```

服务启动后访问 [http://localhost:9966](http://localhost:9966)

## 📁 项目结构

```
git-weekly-report/
├── git_report_app.py        # Python 后端服务（API + 静态页面托管）
├── git_report.html           # 前端页面（单文件 SPA）
├── git-report-config.yaml    # 用户配置文件（自动生成，已 gitignore）
├── 启动周报.command           # macOS 一键启动脚本
├── .gitignore
└── README.md
```

## 🔧 配置说明

| 配置项 | 说明 |
|--------|------|
| GitLab Token | 私有仓库访问令牌，在 GitLab → Settings → Access Tokens 生成 |
| 作者 | 提交记录的作者名过滤（留空则不过滤） |
| 仓库地址 | GitLab 仓库的 HTTP 克隆地址 |
| 分支 | 目标分支名，留空则使用默认主分支 |

## 📝 License

MIT
