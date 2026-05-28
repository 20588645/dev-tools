# 项目分支与工作区整理计划 (Branch and Workspace Cleanup Plan)

为了引入基于专有分支的自动更新机制（方案 B），我们需要首先将当前项目的工作区和分支进行规范化清理。目前工作区存在较多未提交的修改和未追踪的文件，这可能会在后续分支切换和 `git pull` 时引发代码冲突或逻辑混乱。

---

## 1. 当前工作区状态与隐患分析

### 1.1 未提交的文件 (Modified Files)
有 13 个核心文件已被修改但未提交：
- **配置文件**：`package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`
- **后端服务**：`sidecar/index.js`, `sidecar/routes/notebook.js`, `sidecar/routes/upgrade.js`
- **前端代码**：`src/css/style.css`, `src/index.html`, `src/js/api.js`, `src/js/app.js`, `src/js/notebook.js`, `src/js/settings.js`

> [!WARNING]
> 这些修改包含了最近优化的**“IP 样式隔离”**、**“富文本 HTML 标签清洗防重叠”**以及**“一键就地升级功能”**。如果不先进行 Commit，直接切换分支或执行 Git 操作极易引发文件冲突，甚至导致部分未保存的修改丢失。

### 1.2 未追踪的文件 (Untracked Files)
- **PRD 目录**：包含之前的功能设计文档
- **核心逻辑脚本**：
  - `sidecar/routes/ipcheck.js` (IP 检测后端服务)
  - `src/js/ipcheck.js` (IP 检测前端交互)

---

## 2. 整理计划与实施步骤

为了保证代码库的整洁和功能的连续性，我们规划如下三步整理步骤：

### 第一阶段：暂存并提交当前修改 (Commit Current Work)
将本地已验证可正常运行的功能代码（IP 页面优化 + 笔记本样式防干扰 + 就地更新流程）进行统一提交，归档到本地 `dev` 分支，并同步推送到远程 `origin/dev`。

1. **执行暂存**：`git add .` (将修改和新文件全部加入暂存区)
2. **本地提交**：`git commit -m "feat: optimize ip ui, fix notebook list stacking, and streamline in-place auto-upgrade process"`
3. **推送远端**：`git push origin dev`（保持本地 `dev` 与 Gitee `origin/dev` 完全同步且干净）

### 第二阶段：清理冗余分支 (Clean Obsolete Branches)
检查并清理本地不再需要的历史特性分支，减少分支混乱度。
- **当前本地分支**：
  - `master`：主分支，保留。
  - `dev`：当前开发分支，保留。
  - `feature/glacial-crystal-rebuild`：历史特性分支，确认是否已合并，若无用则进行清理。
  - `feature/sidebar-crystal-redesign`：历史特性分支，确认是否已合并，若无用则进行清理。
  - `archive/web-standalone`：存档分支，保留。

### 第三阶段：建立 `release` 更新专属分支 (Establish Release Branch)
在工作区完全干净的基础上，基于最新的 `dev` 分支拉出 `release` 分支，推送到远程，为方案 B 自动更新做准备。

1. **新建分支**：`git checkout -b release`
2. **推送远程**：`git push origin release -u`
3. **切回开发**：`git checkout dev`

---

## 3. 验证计划

1. **验证工作区状态**：执行 `git status`，确保输出为 `nothing to commit, working tree clean`。
2. **验证分支树结构**：执行 `git log --oneline --graph --all`，确保 `dev` 和 `release` 关系清晰，起点一致。
