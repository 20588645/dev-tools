# DevTools Desktop 全新设计落地实施计划（redesign-v2 · 方案 B「柔和玻璃」）

> 文档版本：1.6
> 状态：**批 0～4 全部完成——redesign-v2 收官，13 个业务页（15 个页面文件）整体切换到方案 B「柔和玻璃」**
> 编制日期：2026-08-13
>
> 验收打磨：页头主按钮对齐原型 `.btn`（32×12.5，BaseButton 自持，不再借用输入框 34px 档）；
> 命令页「＋ 添加命令」去掉误用的 `size="sm"`；服务器面板「＋ 添加服务器」与页头主按钮同档；
> 部署历史表收进 16px BaseCard；用量页头补副题。PageHeader 一行式去图标方块，大面板
> `--component-card-radius` + `--shadow-md`，内嵌卡 13px。
>
> 批 4 落地记录：ipcheck 概览换 ScoreRing 纯净度评分环（100−风险分，环色随风险分档）+
> 结论徽标，网络信息换 kvline 键值行，网络信号横排三节点，场景检测换四列小卡，上次检测
> 时间入 toolbar；twofa 账号全面卡片化（原型 fa-card：发行方/大号验证码/账号/贯通倒计时条，
> 点卡复制、悬停置顶与编辑），置顶与分组收进带头面板（分组沿用披露折叠），FilterChip 换
> 分段器（带计数），行内详情与删除入口移入编辑弹窗（含密钥遮罩/最近使用只读信息 +
> 弹窗左下删除账号）；usage 概览大卡拆为四张 StatCard（Token 总量/估算成本/缓存命中/
> 请求总数，顶部渐变条），趋势独立面板 + 新增模型用量排行（RankBar top5），单价覆盖
> 不全时保留提示条；settings 状态卡组换原型 status-strip 单面板横排。
> 截图：`design-preview/screenshots/redesign-v2-batch1/`（四页 × 亮暗 × 双尺寸）。
>
> 批 3 落地记录：todo 换原型平铺任务行（行内完成复选框 + 进行中/已完成/全部分段筛选，
> 搜索与筛选并入左栏面板头，统计并入页头副题），详情面板改「标题行内编辑 + 描述/子任务/
> 提醒时间 + 贴底保存信息」，新增提醒时间编辑，父任务完成确认与清理确认文案对齐原型；
> notes 周导航换居中周次卡（上一周/下一周分列两侧），本周记录行换原型「大号日期 + 单行
> 预览 + 状态点」紧凑结构，编辑面板头换 42px 日期徽章 + 字数/保存态右置，Git 活动参考
> 切换到共享 SidePanel 基座（保留分组/过滤/批量写入全部功能，提交行换分隔线列表），
> BaseTextarea editor 变体恢复原型带边框输入区；notebook 搜索与排序并入左栏面板头、
> 筛选换分段器（带计数）、笔记行换紧凑两行，编辑面板新增常驻格式工具栏（B/I/U/H2/
> 列表/链接/凭证表格/统一格式，经 NotebookRichEditor.applyFormat 落地，凭据表内禁用），
> 新建笔记移至页头。截图：`design-preview/screenshots/redesign-v2-batch1/`（todo/notes/
> notebook × 亮暗 × 双尺寸 + notes-reference 展开态）。
>
> 批 2 落地记录：terminal 预设命令网格与终端收进带头面板（原型 .cmd-card 内联执行 /
> 胶囊标签 / 圆角深色屏），工具栏 sudo 靠左 + 新增命令搜索；editor 标签改原型贴附式
> 圆角顶标签 + 编辑区状态栏合并圆角面板，未保存点改警示色；filetransfer 双栏与队列
> 换柔和玻璃面板、本地/远程徽标、圆角悬停行。xterm 主题沿用 --term-xterm-* token 联动，
> CodeMirror 沿用 data-theme 观察器换主题（批 0 起即全 token 驱动）。
>
> 批 1 落地记录：home 按冻结原型全新实现 9 卡沉浸卡片墙（时钟走秒 / 日期种子色板换肤 /
> 日轨 SVG / 农历与 ISO 周数 / 4 列网格矮窗回退滚动）；run 与 deploy 项目卡收敛到共享
> `cards/ProjectCard` 基座（状态顶边 + 状态徽标 + 贴底状态便签，跨页等高）；两页筛选统一为
> `BaseSegmented` 分段器（标签带计数），统计摘要并入页头副题；deploy 壳层
> （DeployChrome）切换到共享 PageFrame/PageHeader/PageToolbar；日志沿用按对象弹窗的
> LogViewer（BaseDialog）。截图：`design-preview/screenshots/redesign-v2-batch1/`。
>
> 批 0 落地记录：三层 token 与亮暗主题全量切换到方案 B 变量表；主题色运行时切换服务
> （`services/theme-accent.ts` + app store `applyAccentColor`，HSL 推导 + 白字对比度自动加深，
> 状态色不跟随）；AppSidebar 分组导航（224px 毛玻璃，窄窗过渡期收窄至 150px，页面批次完成后回归固定宽）；
> Base* 组件视觉升级（渐变主按钮/毛玻璃弹窗与 Toast/轻表头表格/胶囊徽标等）；新增共享组件
> `cards/ProjectCard`、`cards/StatCard`、`layout/SidePanel`、`disclosure/GroupSection`、
> `charts/{ScoreRing,RankBar,SplitBar,Sparkline,AreaChart,BarChart}`（§3.1 的 LogDialog 由既有
> `logviewer/LogViewer`（BaseDialog 组合）承担，不另建）。门禁：lint/token/架构全绿，449 单测，66/66 E2E。
> 设计基准：`design-preview/redesign-v2/`（冻结提交 `c74af73`，入口 `app/index.html`）
> 前置条件：Vue3 架构迁移已全部完成（执行计划 v1.77，G0～G8 关闭）；全仓样式已 token 化（L1+L2+L3，`885e04c` / `d152538`），硬编码色值 0、`:deep` 0、页面 `!important` 0。
> 核心原则：功能一项不减，视觉与交互整体切换到方案 B；按批次推进，每批可运行、可验收、可回滚。

---

## 1. 背景与目标

旧界面是"想到一个功能开发一个页面"逐步积累的，各页面没有系统性的统一设计。用户决定不再对现有页面做增量优化，而是基于全部现有功能推倒式重设计：三个风格候选比稿后定稿方案 B「柔和玻璃」，并已完成覆盖 13 个业务页（部署面板含三子页，共 15 个页面文件）与 31 个弹窗的可点击 HTML 原型，经用户逐页评审、修改并冻结。

本计划的目标：把冻结原型的视觉与交互落到现有 Vue 3 应用上。功能以现有软件为准（原型假数据不构成功能边界），视觉以原型为准，样式全部经三层 Design Token 承接。

## 2. 设计基准与已冻结决策

### 2.1 原型清单

| 内容 | 位置 |
| --- | --- |
| 应用原型（15 页 + 共享样式/脚本） | `design-preview/redesign-v2/app/` |
| 三个风格候选（比稿存档） | `design-preview/redesign-v2/candidate-*.html` |
| 视觉常量（颜色/圆角/阴影/字体，亮暗两套） | `app/shared.css` `:root` 与 `[data-theme="dark"]` 段 |
| 主题色运行时切换参考实现 | `app/shared.js` `setAccent()/resetAccent()` |

### 2.2 评审沉淀的交互原则（实现时必须遵守）

1. **日志类内容一律按对象弹窗展示**：运行页每个项目、部署页每个构建/部署任务的日志各自弹窗，不做页面底部常驻日志面板。
2. **参考/对照类内容一律常驻侧栏面板**：写作时需要边看边抄的内容（工时内容页的 Git 活动参考）用第三栏面板，可由页头按钮收起，禁止用会遮挡编辑区的弹窗。
3. **首页为无页头沉浸卡片墙**：无页头无大时钟横条，卡片网格铺满视口不留大片空白（窗口过矮时回退滚动）；卡片内容以美观为先，可与软件功能无关。定稿的 9 张卡：每日一言（大卡）、用量摘要、IP 纯净、时钟（实时走秒）、昼夜日轨、年度进度、活动节奏、每周足迹（宽卡）、氛围色板。
4. **氛围色板机制**：按日期生成，每天 0 点自动换一组、当天固定；点击色块把全局主题色切换为该色（运行时覆盖 accent 系 token 并持久化），提供"恢复默认"；成功/警告/错误等状态色不跟随主题色。
5. **项目卡片跨页一致**：本地运行与部署面板的项目卡片同宽同高（统一 min-height + 卡底操作栏贴底），页面切换无跳跃感。
6. **现有软件已成熟的交互结构不倒退**：如工时内容页的周导航 + 本周记录列表（大号日期数字/状态点/覆盖进度）+ 当日编辑（标题+正文分离、自动保存文案）结构。

### 2.3 视觉体系要点

- 柔和玻璃质感：毛玻璃侧栏与弹窗（backdrop-filter）、大圆角（12/16/18px）、柔和多层阴影、蓝紫渐变强调（`#3d7bfd → #7c5cfc`，暗色 `#5b8dff → #9678ff`）。
- 亮暗双主题，全部值以 `shared.css` 两套变量表为准落进 tokens。
- 侧栏分组导航：工作台（首页/运行/部署）、文件与终端（传输/编辑/命令）、记录（待办/工时/笔记）、工具（纯净/双因/用量）、系统（设置），带徽标计数。

## 3. 技术路线

1. **Token 先行**：把 `shared.css` 的视觉常量映射进现有三层 token（`styles/tokens/primitives.css → semantic.css → components.css`）与 `styles/themes/light.css`、`dark.css`；`base.css`（body 渐变背景、滚动条等）随之更新。不新增第四层，不留原型专用变量名。
2. **主题色运行时切换机制**：新增 accent 系 token（主色/副色/渐变/淡化）的运行时覆盖服务（参照 `shared.js` 的 HSL 推导实现），持久化到设置；状态色不跟随；对任意主色做文字对比度校验。
3. **壳层先行**：`AppSidebar` 换分组导航与品牌区、介绍弹窗、外观切换移至侧栏底部；首页路由标记沉浸页（无 PageHeader）。
4. **公共组件视觉升级**：`BaseButton/BaseDialog/BaseCard/BaseBadge/BaseTabs/BaseSegmented/表单类/BaseDataTable/LogViewer` 等按新体系调整——组件层改动全局生效，页面批次只处理页面级结构与样式。
5. **逐页落地**：页面结构对照原型实现；功能清单以现有 `views/*/` 组件与 sidecar API 为准；每页迁完删除被替代的页面级旧样式。
6. **Naive UI 适配层**（`adapters/naive-ui.ts`、`plugins/ui-library.ts`）同步新主题变量。

## 3.1 组件先行策略与组件清单

页面批次开始前，先把原型里所有重复出现的 UI 模式封装/重塑为共享组件（批 0 的主体工作）。批 1～4 的页面工作以"组装共享组件 + 页面级布局"为主，禁止页面私造与共享组件同形态的样式——这也是现有「组件架构门禁」持续校验的内容。

**复用重塑（API 不变，只换视觉）**：

| 类别 | 组件 |
| --- | --- |
| 壳层/布局 | AppLayout、AppSidebar（分组导航）、PageFrame/PageTop/PageHeader/PageToolbar/PageSection |
| 基础 | BaseButton、BaseIconButton、BaseBadge、BaseCard、BaseProgress、StatusIndicator |
| 导航 | BaseTabs、BaseSegmented、FilterChip、BaseSideNav |
| 表单 | BaseInput/BaseSelect/BaseTextarea/BaseCheckbox/BaseRadio/BaseSwitch/BaseDateTimePicker/FormField |
| 反馈 | BaseDialog（毛玻璃弹窗）、ConfirmDialog、AppToastHost、EmptyState/LoadingState/ErrorState |
| 数据/浮层 | BaseDataTable、LogViewer、BaseDropdownMenu、GroupRenameDialog |

**新增共享组件（从原型模式提炼）**：

| 组件 | 来源模式 | 使用页 |
| --- | --- | --- |
| ProjectCard | 统一项目方块卡（158px 高、状态渐变顶边、贴底操作栏） | run、deploy（现 RunProjectCard/DeployProjectCard 收敛共享基座） |
| GroupSection | 可折叠分组 + 重命名入口 | run、deploy |
| StatCard | 顶部渐变条统计卡 | usage、可扩展 |
| LogDialog | 按对象日志弹窗（BaseDialog + LogViewer 组合） | run、deploy、deploy-history |
| SidePanel | 常驻参考侧栏（可收起） | notes（Git 活动参考） |
| ScoreRing | conic 圆环仪表 | ipcheck、home |
| RankBar / SplitBar | 排行条 / 分段占比条 | usage、home |
| Sparkline / AreaChart / BarChart | 轻量 SVG 图表原语 | home、usage、notes |

首页的沉浸卡片（时钟、昼夜日轨、每日一言等）保持页面级组件（沿用 `views/home/components/` 现状），只复用上述图表原语。

## 3.2 第三方组件库决策

现有依赖是 **Naive UI 2.44**（不是 vant），且已按架构规范封装在 Base* 组件后面（页面从不直接引 naive-ui），主题经 `adapters/naive-ui.ts` 的 GlobalThemeOverrides 从 token 注入。

**决策：不新增三方库，沿用 Naive UI。**

- 复杂交互（下拉、日期选择、表格、消息通知等）已由它承载并有 438 项单测覆盖，替换是纯风险无收益。
- 方案 B 的视觉通过「token → GlobalThemeOverrides + 包装组件样式」可以完整达成（圆角/阴影/配色全部可覆盖，毛玻璃在包装层加）。
- 若个别组件达不到质感（如弹窗毛玻璃层次），只需替换**该包装组件的内部实现**为自研，页面调用方零改动——这正是当初封装层的意义。

## 4. 批次划分

每批一个可运行、可验收、可回滚的里程碑，独立提交。

| 批次 | 范围 | 预估 | 出口标准 |
| --- | --- | --- | --- |
| 批 0 设计系统与组件库 | tokens/themes/base、§3.1 全部组件重塑与新建、AppSidebar 分组导航、介绍弹窗、主题色切换服务、Naive 主题注入 | 3～4 人日 | 全局风格整体切到方案 B，共享组件齐备，所有页面可用无回归 |
| 批 1 工作台 | home（9 卡全新实现，时钟走秒/色板换肤/日轨 SVG）、run、deploy 三子页 | 3～4 人日 | 三页与原型一致，日志弹窗化，卡片跨页对齐 |
| 批 2 文件与终端 | filetransfer、editor、terminal | 2～3 人日 | 双栏/多标签/终端视觉切换，第三方组件（CM、xterm）适配新主题 |
| 批 3 记录 | todo、notes、notebook | 2 人日 | notes 按新三栏结构，参考面板可收起 |
| 批 4 工具与系统 | ipcheck、twofa、usage、settings | 2 人日 | 设置含全部分类面板（原型仅示意"通用"，按现有功能补全） |

合计约 12～15 人日。批 1～4 内部顺序可按验收反馈调整；批 0 是唯一硬前置（组件先行：页面批次以组装共享组件为主）。

### 每批固定流程

对照原型实现 → `npm run lint`（eslint + stylelint + token 审计 + 组件架构门禁）→ `npm run test`（单测 + 架构测试）→ `npm run build:frontend` → 相关页面 E2E → 亮/暗 × 1665×1184 / 900×600 截图对照原型 → 用户抽验 → 提交关闭。

## 5. 功能保真基线

- 原型功能覆盖核对已完成：13 页核心功能与 31 个弹窗全部覆盖（含分组重命名、端口强释、FileZilla 导入、临时查码、两段式更新等）。
- 原型已知未细化项（实现时直接按现有软件补全，不视为设计缺口）：编辑器标签右键菜单、文件传输分栏拖拽（FtSplitter）、设置页除"通用"外 5 个分类面板的明细项。
- 实现时逐页以 `PRD/vue-migration/pages/*/assessment.md` 与现有组件为功能对照清单，防止对照原型假数据漏功能。

## 6. 风险与对策

| 风险 | 对策 |
| --- | --- |
| E2E 中视觉相关断言大面积失效 | 每批随批更新对应 spec，不攒到最后；结构性 testid 尽量不动 |
| 任意主题色的对比度问题 | HSL 推导 + WCAG 对比度校验，不达标自动加深/减淡；暖色系主色重点自测 |
| 暗色主题走样 | 原型自带完整暗色变量表，逐值落 token；每批双主题截图 |
| Naive UI 组件与新体系偏差 | adapters 层统一覆盖主题变量，禁止页面级覆写 |
| 第三方渲染区（CodeMirror/xterm/Live2D） | 沿用既有豁免惯例（带理由登记），主题变量注入优先 |
| 中途发现原型交互不合理 | 小偏差直接按更优方案实现并在验收时说明；结构性偏差先回到原型改稿确认 |

## 7. 验收与回滚

- 沿用项目门禁惯例：lint / token 审计 / 组件架构门禁 / 全量单测 / E2E / 用户抽验，全绿才关批。
- 每批独立提交；出现不可接受回归时按批回退（`git revert` 该批提交），不影响其它批次。
