# DevTools Desktop 开发规范

> 本文件是所有 AI 助手与开发者的**强制约定**。任何代码改动前先读完本文件。
> 历史教训：本项目曾由多个 AI 模型先后施工且无规范可循，导致 CSS/JS 大量重复与覆盖战争（治理中）。规范的目的就是不再产生新的债。

## 项目形态

- **Tauri 2 (Rust) + Node.js Sidecar (Express) + 无框架 vanilla JS 前端**——无框架/无构建是刻意选择，禁止引入框架、打包器、转译器
- 前端：`devtools-desktop/src/`（`index.html` 单页多 `<section class="page">` + `js/` 按模块分文件 + `css/` 分层：`base → layout → components → pages/<页面> → overrides`，加载顺序即层叠顺序，新样式写进对应层；`overrides.css` 是顺序敏感的历史晚期覆盖，只减不增）
- 后端：`devtools-desktop/sidecar/`（`routes/` 按模块、`services/` 公共服务、SQLite via better-sqlite3）

## 铁律

1. **新依赖一律 vendor 单文件**预打包进 `src/js/vendor/<name>/`（先例：CodeMirror、ECharts）；禁止 npm 引入前端运行时依赖
2. **开发验证必须用测试沙箱**：`DEVTOOLS_TEST=1 node sidecar/index.js`（端口 13900、独立 `data-test` 库）；**绝不**直接操作正式后端（13456）与正式 `data/devtools.db`
3. 浏览器调试前端：`npx serve src -l 1420 -s`，URL 加 `?apiPort=13900` 指向沙箱
4. **提交**：中文 conventional commits（`feat/fix/chore/docs(scope): 标题`，正文写动机），按逻辑分批提交；**push 必须用户明确要求**
5. **发版**：改 `devtools-desktop/package.json` 版本号 → `node scripts/sync-version.js` → `chore(release)` 提交；用户构建后 `Cargo.lock` 会产生版本号改动，需补一个 chore 提交

## 页面结构约定（新页面必须遵循）

```html
<section class="page" id="page-xxx">
  <div class="page-fixed-header">   <!-- 标题区 + 工具栏，真固定 -->
    <div class="page-header-bar page-header-simple">…标题/副标题/操作按钮…</div>
    <div class="page-toolbar">…筛选 chips…</div>
  </div>
  <div class="page-scroll-body">…全部内容，独立滚动…</div>
</section>
```

- 顶部固定由 `app.js` 的 `initPageStickyHeaders()` 自动接管（flex 定高布局）；**禁用 `position: sticky`**——WKWebView 在子滚动容器中惯性滚动时 sticky 会跟滚抖动（已踩坑返工）
- 动态页面可用 `renderPageHeader(page, {icon, title, subtitle, actionsHTML, toolbarHTML})`
- 菜单注册三件套：`SIDEBAR_MENU_ITEMS` 加项（菜单名**固定 4 个汉字**）+ `DEFAULT_MENU_ORDER` + `switchPage` 中的初始化分支

## 样式规范

- 颜色/圆角/间距/字体一律使用 `:root` CSS 变量（`--primary`、`--bg-card`、`--radius`、`--font-mono` 等），**禁止新增硬编码 hex 色值**
- **明暗主题都必须验证**（`body[data-theme]`）；图表颜色运行时读 CSS 变量，并监听 `data-theme` 变化重绘；两主题视觉冲突时做差异化配色（先例：用量统计活力环）
- 同一选择器只允许一处权威定义；**禁止用 `!important` 解决覆盖问题**（存量历史债除外，治理中只减不增）
- 数字展示：万/亿分级、金额两位小数、数值用 `var(--font-mono)`；长文本省略号 + `title` 悬浮全名

## JS 规范

- 各模块全局函数式风格（无模块系统）；公共工具（toast/弹窗/格式化/防抖）放 app.js 公共区，**禁止模块内重复造轮子**
- 弹窗一律 `showConfirm / showAlert / showPrompt`，提示一律 `showToast`；**禁用原生 alert/confirm/prompt**
- 图表统一 ECharts（vendor 引入），实例必须配 `ResizeObserver` 自适应 + 主题观察器重绘
- 中文注释，只写"为什么"（约束、坑、取舍），不写"做了什么"

## sidecar 规范

- 路由统一模式：`try/catch` + `res.status(500).json({ error: e.message })`；查询参数做白名单校验
- 建表写在 `services/database.js` 主 `exec`；兼容旧库的迁移用 `try{SELECT 列}catch{ALTER TABLE}` 模式，索引建在迁移之后
- 长任务/外部 IO 必须有超时与失败兜底；外部数据（汇率等）带缓存 + 离线 fallback

## 质量门（提交前自查）

1. `node --check` 改动到的全部 js 文件
2. `cd devtools-desktop && npm run lint`（ESLint + Stylelint 最小规则集，零容忍新增报错）
3. 改动可在浏览器观察时：preview 验证（含明暗两主题）后再交付
