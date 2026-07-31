# 本地运行页面迁移决策

> 状态：**PG3 已通过（2026-07-30，用户确认采纳推荐方向）**；PG4 初版实现与自动验收已完成，当前仅作阶段性代码封存。真实 Tauri E2E、已发现体验问题和组件架构专项均未关闭，Phase 6-1 尚未完成
> 关联评估：[assessment.md](./assessment.md)
> 产出日期：2026-07-30

## 0. 用户已确认的方向（PG3）

用户于 2026-07-30 确认按推荐与倾向执行：

1. **优化等级 L1**：等价迁移 + 修 P1/P2/P3/P7 四个可见缺陷 + 清 CSS 污染。不做 P4/P5/P6 弹窗与分组重排，留待本页稳定后单独处理。
2. **LogViewer 路线 A**：先抽公共 LogViewer 作为**独立前置子步骤**，让旧 deploy 接上并验证无回归，单独验收后才进 run 页正式迁移。
3. **F3 语义**：用户显式填写的服务端口**强制覆盖**推断值，优先于配置文件扫描。
4. **F2 认知**：历史状态修复只对新记录生效，旧数据无法追溯，已接受。
5. **附加 L3-A**：强释端口前增加「该进程不是本应用启动的」警示与二次确认（记为 F4）。

因选 L1 且不改布局结构，**不需要 HTML 原型**（L2/L3 才要求）。P1/P2/P3/P7 的修复方案已在第 7 节 L1 中写明，属于既有形态内的局部修正。

## 1. 保留清单（不动语义）

以下项经 PG1 确认是有意为之的设计，迁移后必须保持等价行为。详细原因见 assessment 第 4 节。

### 1.1 实时与状态机

1. 三道兜底机制并存：`run-status` 主推送 + `run-status` 重连全量对账 + 15 秒轮询。
2. 轮询双职责（刷运行时长 + 后端对账），且仅在有运行中项目时请求，离开页面停表。
3. 进程状态以 Sidecar 返回为权威，卡片本地状态不作权威。
4. `attempt` 守卫防旧进程 close 事件串号。
5. 运行态为全局共享（首页卡片 + 托盘菜单同源），不私有化到页面。

### 1.2 防连点与按钮态

6. `restart` 不用 `withButtonBusy`，改为立即禁用 + 等 WS 推回。
7. `canRestart` 仅 `running` 放开。
8. 多模块未勾选模块时禁用「启动运行」并给 title 提示（事前引导而非点了才报错）。

### 1.3 端口处理

9. `lsof -sTCP:LISTEN` 过滤，不把 HMR 客户端连接误判为占用。
10. 外部进程 vs 本应用进程区分：本应用旧进程直接停，外部进程抛 `EADDRINUSE` 交用户决定。
11. 强释后轮询确认端口真释放（最多约 3s），不用固定延时。
12. 启动意图（模块/命令/Node/autoRestart）透传强释重启路径。

### 1.4 其他

13. 编译报错通知按 `jobId:compileErrorSeq` 延时去重，任务结束清理。
14. 多模块 `open` 逐个打开 `<模块>.html#/`，单体开根地址。
15. 两种空态区分（无项目 → 引导添加；被筛选光 → 无匹配）。
16. 「多模块项目数」统计口径（不回退到无信息量的「已保存命令」）。
17. 日志三档着色 + 文件路径可点跳编辑器。
18. 分组折叠态与自定义排序存 `localStorage`（纯视图偏好，不入库）。

## 2. 修复清单（PG1 发现的功能缺陷）

| 编号 | 问题 | 位置 | 建议 |
| --- | --- | --- | --- |
| F1 | 运行历史「模块」列恒为 `—` | `run.js:810` vs `sidecar/routes/run.js:22` | 统一字段名为 `modules`，前端改读 |
| F2 | 「手动停止」档永远走不到 | `sidecar/routes/run.js:33` | 入库保留 `stopped` 原值，前端三档才有意义 |
| F3 | 配置的「服务端口」不参与启动 | `run.js:521` + `sidecar/routes/run.js:819` | 启动时透传 `project.runPort`，强制覆盖推断值 |
| F4 | 强释端口无归属警示与二次确认 | `sidecar/routes/run.js:970-989` | 展示占用进程完整路径与启动时间，明确标注非本应用进程，强杀前二次确认 |

F3 需要用户定语义：填了端口是**强制覆盖**推断值，还是**仅作为推断失败时的兜底**？我倾向强制覆盖——用户显式填写的值优先于文件扫描，且当前「填了没反应」是最坏的一种（无提示的静默失效）。

F2 会改变 `run_history` 的入库取值。历史表只存最近 100 条、纯展示用途，不参与成本或统计计算，改动风险低；但**旧数据里已被写成 `success` 的手动停止记录无法追溯**，只能对新记录生效。

## 3. 优化清单（PG0 发现的视觉/交互问题）

| 编号 | 问题 | 触发条件 | 等级归属 |
| --- | --- | --- | --- |
| P1 | 窄窗口工具栏换行（历史按钮掉行） | 窄窗口 + 有运行中 | L1 |
| P2 | 运行中卡片 4 按钮换行 | 窄窗口 + 运行中 | L1 |
| P3 | 「一键释放并启动」文字截断溢出 | 端口占用态 | L1 |
| P4 | 配置弹窗双层嵌套滚动 | 窄窗口 + 多模块 | L2 |
| P5 | 弹窗两模式宽度差 250px | 切换模式 | L2 |
| P6 | 分组视图单项目组留半幅空白 | 有分组 | L2 |
| P7 | 编译报错时进度条语义矛盾（停 65% 却称运行中） | 编译报错 | L1 |

## 4. 删除清单

| 项 | 理由 |
| --- | --- |
| `run.css` 中的 `.ha-table` 全局规则（`8-40`、`525-537`） | 不属于本页，与 `components.css`、`overrides.css` 三处重叠 |
| `run.css` 中 `#logModal` 跨页选择器（`495-522`） | 随 LogViewer 抽取转移到组件内 |
| 37 处 `!important` | 迁移到 scoped SFC + Design Token 后应归零 |
| `#page-run` ID 选择器 | 同上 |
| 页面内联 `onclick` 全局函数（约 20 个 `window.*`） | 转为组件事件 |
| `escapeHtml`/`escapeAttr`/`escapeOnclickArg` 手工转义 | Vue 模板自动转义 |

## 5. 新增清单

| 项 | 说明 |
| --- | --- |
| `useRunStore` | 计划文档 1139 行要求；运行态单一来源，首页/托盘/本页共享 |
| `run-service.ts` | 类型化 14 个接口，副作用接口单独标注 |
| 运行任务类型定义 | `RunJob`、`RunStatus`、`RunHistoryItem`、`PortOwner` |
| `useRunPolling` composable | 封装 3.1 的三道兜底，含「仅运行中才请求」与离页停表 |
| **公共 LogViewer 组件** | 见第 6 节，本页最大结构决策 |
| 运行历史表格 | 复用或新建表格组件，替代手拼 `.ha-table` |

## 6. 关键结构决策：LogViewer 怎么办

`#logModal` 是 run 与 deploy 共用的同一份 DOM，`appendLog`、进度步骤、日志搜索、编辑器跳转全在 `app.js`。计划文档 1153 行要求两页复用公共 Log Viewer，但 deploy 是 Phase 6-2，排在本页之后。

三条路，各有代价：

**A. 先抽公共 LogViewer 再迁 run。** 一次做对，deploy 迁移时直接复用。代价：本页工作量显著上升，且要在 deploy 尚未迁移时保证旧 deploy 仍能用这个新组件（或保留旧路径并存）。

**B. run 页先建私有 LogViewer，deploy 迁移时再提升为公共。** 本页范围可控。代价：中间态有两份日志实现，且提升时要改两处。

**C. run 页暂时继续调用旧 `#logModal`。** 工作量最小。代价：`RunView.vue` 要伸手操作页面外的旧 DOM，违背迁移目标，且 `run.css` 里的 `#logModal` 样式无法清理，PG5 删不干净。

我推荐 **A**。理由：C 会让 PG5 清理无法收口（这是前几页都做到了的），B 的「中间态两份实现」在 deploy 那页体量（很高复杂度）下容易固化成永久两份。A 虽然前期重，但它把「日志」这个两页共有的核心能力一次性做成资产。

如果选 A，建议把它拆成**独立的前置子步骤**（先抽组件 + 让旧 deploy 接上 + 验证 deploy 无回归），验收通过后再进 run 页正式迁移——符合项目「大改动分步」规范。

## 7. L0～L3 方案

### L0 等价迁移

只把旧实现搬到 Vue，行为、布局、文案完全不变。修 F1/F2/F3 三个功能缺陷，不动任何视觉问题。LogViewer 走路线 C。

- 交付：`RunView.vue` + `useRunStore` + `run-service.ts` + 类型 + 单测。
- 不解决：P1～P7 全部保留，`run.css` 的 `!important` 和 `.ha-table` 污染保留。
- 适合：只想尽快让这页脱离旧架构，视觉问题以后再说。

### L1 等价迁移 + 修硬伤（推荐）

L0 + 修复 P1、P2、P3、P7 四个**功能性可见缺陷**，并清理 CSS 污染。

- P1：工具栏在窄窗口把「全部停止」与「运行历史」收进同一行的溢出菜单，或把「全部停止」移到运行中统计卡上（它本就是运行中才出现的操作）。
- P2：卡片按钮在窄窗口收敛为「停止 + 打开地址」两个主操作，重启/日志进 `BaseDropdownMenu`。
- P3：按钮改为不平分宽度，长标签按内容宽 + 允许换行，或缩短为「释放并启动」。
- P7：进度条改为三态语义（启动中不确定态 / 运行中满格绿 / 编译报错满格红），不再停在中间值。
- CSS：`.ha-table` 归还公共层，`#logModal` 样式随 LogViewer 走，`!important` 归零，走 Design Token。
- LogViewer 走路线 A（前置子步骤）。
- 不解决：P4、P5、P6 三项弹窗与分组布局问题。

### L2 重构弹窗与分组呈现

L1 + 重新设计运行配置弹窗与分组视图。

- P4/P5：弹窗改为单一宽度、单栏纵向流，模块选择器不再内部滚动（改为 chips 多选 + 搜索过滤，超出按行换行由外层统一滚动）。启动与配置两种模式共用同一骨架，差异只在字段可见性和底部按钮，消除 250px 跳变。
- P6：分组内卡片网格改为自适应列宽（`repeat(auto-fill, minmax(...))`），单项目组不再留半幅空白。分组头操作收进 hover 显示的图标组或 `BaseDropdownMenu`，`✎` 换成 SVG 图标（不用文本字形）。
- 需要 PG3 原型：亮 + 暗 + 900×600 三份，放 `design-preview/run-l2.html`。

### L3 增强（默认不做）

以下均为**新增能力**，不在迁移必要范围内，列出供判断：

- **L3-A 端口占用诊断增强**：展示占用进程完整路径与启动时间，明确标注「该进程不是本应用启动的」，强释前二次确认。理由：`force-release` 是全项目副作用最大的操作，当前只显示 pid 和 comm 就让用户按下强杀。
- **L3-B 运行历史可用化**：修完 F1/F2 后历史才有真实信息量，可加按项目筛选、失败记录快速重跑。
- **L3-C 多服务并行视图**：当前多个服务同时运行时只能靠卡片分散查看，可加一个运行中服务的紧凑列表（端口/时长/编译状态一览）。
- **L3-D 日志增强**：日志按 error/warn 过滤、跳到首个报错。依赖 LogViewer 已抽出。

## 8. 我的建议

**选 L1**，并把 LogViewer 抽取作为前置子步骤单独验收。

理由：这页与 twofa/usage 不同——它没有「核心功能在默认尺寸下不可用」那种硬伤（PG0 实测三档尺寸页面层都干净），所以不需要 L2 那样的重新设计。P1/P2/P3/P7 是四个确实会影响使用的可见缺陷，值得在迁移时一并修掉；而 P4/P5/P6 属于「不好看但不挡路」，可以等这页稳定后单独处理。

同时这页真正的风险不在视觉，在**进程副作用与实时链路的等价性**。把工程预算放在 store/轮询/状态机的正确性和 LogViewer 抽取上，比放在弹窗重排上更划算。

如果你希望连弹窗和分组一起做干净，那就选 L2，我会先出三份原型给你确认再动正式代码。

## 9. 待用户决策项

1. **优化等级**：L0 / L1（推荐）/ L2，是否附加任何 L3 项。
2. **LogViewer 路线**：A（前置抽取，推荐）/ B（先私有后提升）/ C（暂用旧 DOM）。
3. **F3 语义**：用户填写的端口是强制覆盖推断值（推荐），还是仅作推断失败兜底。
4. **F2 认知**：历史状态修复只对新记录生效，旧数据无法追溯，确认接受。

## 10. 手动 E2E 需求（PG4 之后）

本页涉及真实进程，以下必须由用户在真实 Tauri 中手动验收，自动化不代劳：

- 单体项目启动 → 日志实时输出 → 打开地址 → 停止。
- 多模块项目勾选多个模块启动 → 逐个入口页打开 → 重启保留模块 → 停止。
- 端口被外部进程占用 → 诊断展示正确 → **强释并启动**（此项风险最高，执行前请确认被杀进程可接受）。
- 多服务并行 → 批量停止。
- 编译报错 → 通知与红色态 → 修好后恢复。
- Node 版本切换生效（`node -v` 或日志确认）。
- 自动重启（异常退出后自动拉起，最多 3 次）。
- 运行历史三档状态与模块列显示正确（验 F1/F2）。
- 填写服务端口后实际生效（验 F3）。
- 离开页面后轮询停止（后台无持续请求）。

---

## 11. PG4 实施记录（2026-07-31）

L1 已实现完毕，自动验收全绿，**等待用户真实 Tauri 手动 E2E**。以下是新会话接手所需的全部关键信息。

### 11.1 落地结构

```
frontend/src/
  components/logviewer/        LogViewer.vue + log-format.ts(+test)   公共日志弹窗（run/deploy 共用）
  stores/run.ts(+test)         运行态单一来源（取代旧 runningProjects / portOccupancyAlerts）
  stores/log-task.ts           日志弹窗状态（取代旧 activeTask / currentRunId / currentDeployId）
  services/modules/run-service.ts(+test)      14 个接口，按副作用分区标注
  services/modules/project-service.ts         项目实体（run/deploy/home 共用）
  legacy/log-viewer-bridge.ts  window.__logViewer 过渡桥，deploy 迁完即删
  views/run/
    RunView.vue                页面主体
    run-format.ts(+test)       纯展示格式化
    components/                RunProjectCard / RunGroupSection / RunConfigDialog
                               / RunHistoryDialog / RunGroupRenameDialog / RunReleaseDialog
    composables/               useRunPage / useRunActions / useRunRealtime(+test) / useRunGroups
tests/e2e/run.spec.ts          12 项
```

已删除：`src/js/run.js`（969 行）、`src/css/pages/run.css`（618 行）、`#logModal` / `#runModal` / `#runHistoryModal` 三处旧 DOM 及其孤儿 CSS。旧实现净减约 1186 行。

### 11.2 必须知道的三个坑（都已踩过并修复）

**① 弹窗必须走 `BaseDialog`，不能自建覆盖层。**
`MigrationHost` 挂在 `#page-home` 内，而 `layout.css` 有 `.page { display: none !important }`。手写 `position: fixed` 覆盖层在切到其他页面后整体不可见，表现为「点了没反应」。`BaseDialog`（`NModal`）自带 teleport 到 body，没有这个问题。E2E 有专门用例守这条（`shows the log viewer on top of the run page...`），且已验证它能抓到回归。

**② `deploy.js` 复用了 run 页的分组类名与辅助函数。**
删 `run.js` 时漏了这层依赖，导致 `renderProjects` 抛 `orderedRunGroups is not defined`、`loadProjects` 整体中断。现已把 `RUN_UNGROUPED` / `getRunGroupOrder` / `setRunGroupOrder` / `orderedRunGroups` 移入 `deploy.js`，localStorage 键名与 Vue 侧 `useRunGroups` 保持一致（两边共享同一份偏好）。E2E 里 `.run-group` 选择器必须限定 `#vue-run-host`，否则会匹配到部署页的分组。

**③ 量弹窗尺寸要用 `offsetWidth`，不能用 `getBoundingClientRect`。**
Vue 过渡的 `transform: scale` 会让 rect 量到动画中途值（曾误读为 434px / 490px，实际 980px）。

### 11.3 公共组件的可选扩展（默认值不变，既有使用者零改动）

| 组件 | 新增 prop | 用途 |
| --- | --- | --- |
| `BaseDialog` | `subtitle` / `bodyMaxHeight` / `closeLabel` | 副标题、内容区定高自滚动、覆盖关闭按钮无障碍名 |
| `BaseProgress` | `processing` | 转发 `NProgress` 的流动效果，表达「进行中、时长未知」 |
| `BaseInput` | `defineExpose({ focus, blur, select })` | 原本拿不到底层输入框，弹窗打开时无法聚焦 |

### 11.4 已修缺陷

| 编号 | 内容 |
| --- | --- |
| F1 | 运行历史「模块」列恒为 `—`（后端字段 `modules`，旧前端读 `moduleNames`） |
| F2 | 「手动停止」档走不到。**比原计划深一层**：`status='stopped'` 在两处被设置（手动停止 / 退出码 0），单纯去掉改写会让两者都显示「手动停止」。现以 `/stop`、`/batch-stop` 打的 `job.stopRequested` 标记区分，`/restart` 显式清除该标记 |
| F3 | 配置的服务端口不参与启动。后端改为 `port \|\| project.runPort \|\| inferProjectPort(...)`，前端启动时透传 |
| F4 | 强释端口前展示占用进程完整路径/用户/进程组并二次确认；非 nvm 目录下的进程判为外部进程并红色强警示 |
| F5 | `updateLogModalCloseBtn` 选择器 `.btn-secondary` 早已失效（按钮组件迁移时改成 `.btn`），「最小化」文案从未生效。随重写消除 |
| P1 | 窄窗口有运行中服务时工具栏换行挤掉「运行历史」→ 收进溢出菜单，高度恒定一行 |
| P2 | 运行中卡片 4 按钮换行 → 次要操作收进 `BaseDropdownMenu` |
| P3 | 「一键释放并启动」文字截断溢出 → 不再平分固定宽度 |
| P6 | 分组内单项目留半幅空白 → `auto-fit` 折叠空轨道 + 单卡片限宽 420px |
| P7 | 编译报错时进度条停在 65% 却称「运行中」 → 三态语义（启动中/编译中用不确定态，其余满格 + 语义色） |

**P4 / P5 按 L1 定义未做**（配置弹窗双层嵌套滚动、启动与配置两模式宽度差），留待本页稳定后单独处理。

### 11.5 「手写重复公共组件」的清理

写页面时因未先翻 `components/` 与 `composables/` 清单，出现 9 处重复实现，已全部改回公共组件：

`BaseDialog`（日志弹窗外壳）、`BaseProgress`（进度条）、`BaseInput`（日志搜索框）、`FilterChip`（快捷模块 chip）、`BaseCheckbox`（收藏模块勾选）、`StatusIndicator`（卡片状态点 + 分组「运行中 N」，两处各写过一遍）、`BaseCard`（统计卡 + 项目卡）、`useInterval` + `usePageVisibility`（轮询定时器）、`useInterval`（「已等待」计时器）。

**刻意保留手写**：运行历史 `<table>`（项目无公共表格组件，usage 页 6 处同样手写）、分组折叠触发器 `<button>`（整行可点复合区域，`BaseButton` 承载不了，原生 button 提供正确 `aria-expanded`）、卡片内小容器边框（无对应组件；`BaseBadge` 是语义状态徽标，不适合「vite」「18.20.4」这类中性信息）。

换 `usePageVisibility` 后有一处真实行为差异：手写版每次轮询实时读 `document.visibilityState`，公共版靠 `visibilitychange` 事件更新（后者更优）。单测已改为派发真实事件，并补了「回到前台恢复对账」断言。

### 11.6 自动验收结果

`npm run lint` / `lint:tokens` / `typecheck` / `test:unit`（34 文件 **181 项**）/ `build:frontend` / `npx playwright test`（**53 项**，含其他 8 页无回归）全部通过，`git diff --check` 干净。

新 Vue 代码 `!important` 为 0，无 ID 选择器，全部走 Design Token。

### 11.7 遗留待确认

用户报告过一次现象：截图中「运行中」统计从 1 变 2，但第二张卡片仍显示「尚未运行」。**尚未复现与定位**，需在真实 Tauri 下确认是否真有两个服务在跑。若确有，说明卡片与统计的数据源存在不一致，需查 `useRunPage.stats` 与 `store.activeJobs` 的更新时序。

### 11.8 下一步

1. 当前代码按用户要求先创建本地阶段性提交，不代表 Phase 6-1 验收通过，也不推送远端。
2. 暂停进入新页面，先执行组件架构合规专项：固化规则和自动门禁，补齐公共能力，再逐页收口存量偏差。
3. 合规基础完成后恢复 Phase 6-1，处理用户已反馈的「页面改完后不太好用」问题，再按第 10 节清单完成真实 Tauri 手动 E2E；不得用当前自动验收结果替代真实进程验收。
4. Run 和已迁移页面的功能/视觉验收、组件架构验收全部通过后执行全站回归。
5. 上述门禁全部关闭后才允许进入 Phase 6-2 部署面板；届时删除 `legacy/log-viewer-bridge.ts`，并把 `deploy.js` 里的分组辅助函数、`runningProjects` 全局、`loadRunStatuses` 一并收敛到 Vue store。
