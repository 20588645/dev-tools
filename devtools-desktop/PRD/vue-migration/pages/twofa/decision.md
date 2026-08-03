# 双因验证 `twofa` 迁移决策记录

> Phase 5-5 · 优化等级 L2 · 原型 `design-preview/twofa-l2.html`
> 状态：PG0～PG5 已完成；组件架构二次收口完成，最终真实 Tauri Smoke Test 合并专项执行

## 1. 现状结论（PG0～PG1）

用户反馈这页「像半成品」。实测**功能层面并非半成品**：840 行 JS + 721 行 CSS + 8 个接口，分组折叠、收藏、标签、8 位 / 60 秒周期、密钥遮罩、最近使用、导入导出均已实现；密钥用 AES-GCM 加密（带 authTag）；`app.js` 也正确调用了 `stopTwoFAPolling` 清理定时器；`!important` 为 0。

问题集中在布局与交互，其中一处是硬伤：

**双栏在默认窗口失效。** `twofa.css:658` 断点写 `@media (max-width: 1280px)`，而默认窗口正好 1280px，边界包含，于是双栏 `grid-template-columns: minmax(0,1fr) 388px` 被覆盖成单列。实测详情面板被推到 y=1187（视口外一千多像素），`position: sticky` 同时失效。也就是说这页最核心的「点账号 → 看详情 → 取码」在默认尺寸下事实上不可用。设计稿 `design-preview/2fa-accounts.html` 本身就是 390px 固定右栏，在窄窗口没有解法。

其余问题：114 个 `#page-twofa` ID 选择器；零 Design Token（全用 `--primary`、`--bg-card` 等旧变量）；每行四个常驻操作按钮，红色「删除」逐行扎眼（与「颜色只服务语义状态」的偏好冲突）；「最近使用」空状态文案溢出容器且无记录时白占一整块高度；长账号名无省略号。

安全项：导出接口会解密并返回明文密钥，且无任何确认或警示。

## 2. PG3 决策：L2，右栏重新设计

用户明确要求「重新考虑这个地方的内容」，因此**不修断点数字**，而是取消固定右栏——388px 右栏在窄窗口必然塌陷，塌了就等于没有，这正是当前 bug 的根源。

核心形态三层：

1. **行内取码**：验证码是每行字号最大的元素（21px 等宽），紧跟倒计时环（SVG 圆环 + 秒数，最后 5 秒转警示色），右侧只有一个「复制」主操作。取码是 90% 的使用场景，不该需要二次点击。
2. **点击行内展开详情**：算法/位数、周期、密钥遮罩、最近使用横向铺开，编辑/收藏/删除收在此处。详情紧贴被点的行，不需要去别处找。宽窄窗口同一套交互，不再有「双栏塌陷」这个失效模式。
3. **收藏置顶为「常用」卡片**：最常用账号提到首屏，点卡片直接复制。

窄窗口取舍：常用卡片隐藏倒计时环（233px 放不下头像 + 标题 + 验证码 + 环四件套），秒数信息在下方账号行仍然存在。

被否决的替代方案：保留右栏、仅在窄窗口改抽屉——仍然是两套交互两套失效路径，不如统一为内联展开。

## 3. PG4 之后的两轮增补（用户提出，均已通过手动 E2E）

### 第一轮

1. **删除账号无反应**：原实现用了原生 `globalThis.confirm`，Tauri WebView 会禁用它。改用项目既有 `ConfirmDialog`（Todo 页同款）。
2. **折叠/展开图标错位**：`transform: rotate()` 直接作用在「⌄」文本节点，该字形本身不居中。改为放入固定尺寸居中容器再旋转，实测折叠前后中心点位移为 0。
3. **无法配置分组**：原为 `BaseSelect` 只能选已有分组，新分组无从创建。改为可输入文本框 + 已有分组 chips 快捷点选。**未改 `BaseSelect` 公共组件**，避免影响其他页面。
4. **移除导出功能**：前端按钮/弹窗/service/composable、后端 `/api/twofa/export` 路由与 `exportAccounts` 全部删除。该函数会解出明文密钥，留着只是无用的暴露面。
5. **新增快捷查询**：`POST /api/twofa/preview`，无状态计算，**不落库不加密保存**。支持裸 Base32 与 otpauth 链接（自动带出算法/周期/位数），倒计时归零自动重算，可复制或一键转为正式账号，关闭弹窗即丢弃密钥。

### 第二轮

6. **分组与标签错位 + 移除标签**：错位源于分组带说明文字与候选 chips，与并排的单行「标签」输入高度不齐。分组改为独占一行；标签编辑移除，但**保留数据层 `tag` 字段**并在行上继续显示，编辑保存时透传原值——已导入账号可能带标签，删字段会丢数据（数据准确性底线）。
7. **菜单名规范**：`2FA 验证码` → **双因验证**（4 个汉字，与其余 10 个菜单一致）。改动侧边栏 `app.js`、设置页菜单排序 `useSettings.ts`、页面标题三处。

### 顺带修复的既有缺陷

`sidecar/services/twofa.js` 的 otpauth 解析：`if (!issuer) issuer = parts.shift()` —— `shift()` 仅在 issuer 为空时执行，导致链接同时带 `issuer=` 参数与 `Issuer:account` 标签时，账号名被解析为 `Issuer:account`（带前缀）。会影响从 Google Authenticator 导入。已修，三种 label 形态均验证。

## 4. 正确性验证要点

快捷查询与已入库账号使用同一密钥时，结果必须一致——实测两次（`397789`、`134172`）均与对应账号的 `currentCode` 完全相同，确认计算路径正确。周期翻转后验证码正确轮换（`583001` → `300075`）。

## 5. PG5 清理

已删除 `src/js/twofa.js`、`src/css/pages/twofa.css`，以及 `/api/twofa/export` 路由与 `exportAccounts`。`rg` 确认旧全局函数零消费者；`index.html` 中 `#page-twofa` 只余 `#vue-twofa-host`，两个旧弹窗 DOM 也已移除。

**刻意保留**：`decryptSecret`、`getAccounts`、`generateTotp`、`normalizeSecretInput` 仍被模块内部使用（算码、保存时保留原密钥、导入）；`importAccounts` 保留用于从其他工具迁入；`app.js` 的 twofa 侧边栏菜单项保留。

清理后 lint、tokens、build、单测 119 项、全站 E2E 41 项全部通过；Sidecar 正常启动且 `/accounts` 200、`/export` 404、`/preview` 200；浏览器复检两档窗口与亮暗主题，四个旧全局函数均为 undefined，控制台无 error/warning。

## 6. 组件架构二次收口（2026-08-03）

本轮不改变已确认的行内取码、分组、常用账号、行内详情、快捷查询、导入、编辑、删除确认或 AES-GCM/SQLite 数据契约。架构复核确认页面重复实现了 FilterChip、圆形倒计时和折叠结构，并保留 4 个原生按钮、3 个裸定时器以及账号展开触发区内嵌复制按钮的语义冲突。

工具栏和分组建议接入 `FilterChip`，分组/账号详情接入 `BaseDisclosure`，倒计时接入 `BaseProgress circle`，常用卡片接入 `BaseSelectableItem`；复制按钮通过 Disclosure actions slot 与展开触发器分离。公共层补齐 FilterChip ARIA、Disclosure contentGap 和 `useInterval autoStart` 契约，并先同步组件预览、smoke test、独立 timer test 与共享清单。Twofa 原生控件 4 → 0、裸定时器 3 → 0，专项机器基线由 23 降至 16，批准例外仍为 0。

Twofa Playwright 11 项全部通过，覆盖亮暗主题、900×600、筛选、分组折叠、行内详情、圆形倒计时、快捷查询无落库、删除确认、新分组、标签保留和批量导入。全量 `npm run lint`、`npm test`（36 个测试文件 / 190 项单元与组件测试 + 架构门禁 4 项）、`npm run typecheck`、`npm run build:frontend`、`git diff --check` 通过。正式 Sidecar `13456/data` 网页只读验收确认 1280×720 与 900×600 下 3 组、4 个账号、唯一筛选态、折叠语义及横向溢出均正常；未搜索、复制、编辑、收藏、删除、导入或执行后端写入。该网页验收不替代专项最终真实 Tauri Smoke Test。
