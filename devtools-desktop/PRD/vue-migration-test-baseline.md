# DevTools Desktop Vue 迁移测试基线

> 建立日期：2026-07-21  
> 基线阶段：Phase 0 → Phase 1 / G1  
> Git 分支：`develop`  
> 基线 HEAD：`f841e22e5e2386cdf93a7edbef15803feb2d1f7b`  
> 状态：G1 技术实现与自动化验收已通过；用户手动 E2E 和基线提交等待确认

## 1. 基线目的

本文件记录 Vite、TypeScript 与 Vue SFC 构建骨架接入前的实际状态。迁移后的错误只有在相同检查原本通过、迁移后失败时，才归类为迁移回归；本文件中已经存在的问题不得误归因于 Vue 重构。

## 2. 工作区状态

- 建立基线时共有 24 个已修改或未跟踪条目。
- 这些改动包含此前已经确认的首页、用量统计、2FA、部署样式、迁移计划和设计预览，所有权混合，未执行清理、重置或覆盖。
- 未创建自动 Git commit，避免在未明确要求提交的情况下把既有混合修改写入历史。
- Phase 1 必须在当前状态上做增量修改；不得通过 checkout、reset 或 stash 丢弃现有内容。

## 3. 工具链基线

| 工具 | 版本 |
| --- | --- |
| 默认 shell Node.js | `v26.4.0` |
| Sidecar Node.js | `/usr/local/bin/node v18.19.1` |
| 软件内更新构建 Node.js | `/usr/local/bin/node v18.19.1` |
| npm | `11.17.0` |
| Rust | `1.95.0` |
| Cargo | `1.95.0` |
| Tauri CLI | `2.11.2` |
| 应用版本 | `0.1.93` |

已知约束：`better-sqlite3` 当前按 Node 18 的 ABI 108 编译，不能由默认 Node 26 直接加载。数据库维护脚本必须使用 `/usr/local/bin/node`，或者在后续阶段统一 Sidecar Node 运行时与原生模块构建链。

Phase 1 初次接入的 Vite 8、Vue Plugin 6、Vitest 4、jsdom 29 和 Vue Router 5 只支持 Node 20+，与软件内更新固定使用的 Node 18.19.1 不兼容。该回归已修复并锁定为：Vite 6.4.3、Vue Plugin 5.2.4、Vitest 3.2.7、jsdom 26.1.0、Vue Router 4.6.4；这些版本均兼容 Node 18，`npm audit` 为 0 个漏洞。

## 4. 构建基线

### 4.1 旧静态开发入口

- 命令：`npx serve src -l 1420 -s`
- 地址：`http://127.0.0.1:1420`
- 建立基线时服务可访问。

### 4.2 Tauri 正式构建

- 命令：`npm run build`
- 结果：通过。
- Rust release 构建：通过。
- macOS App bundle：通过。
- 产物：`src-tauri/target/release/bundle/macos/DevTools.app`
- 版本同步：所有版本均已是 `0.1.93`，无文件改动。

### 4.3 Phase 1 构建链复核

- `npm run build:frontend`：通过，生成 `dist/index.html`、Vite bundle 以及完整旧 CSS、JS、vendor 资产。
- `npm run build`：通过，Tauri 已实际执行新的 `beforeBuildCommand`，并从 `../dist` 生成 macOS App。
- 构建产物：`src-tauri/target/release/bundle/macos/DevTools.app`。
- Vite 对旧 classic script 及 `publicDir` CSS 的提示属于迁移期预期警告；这些文件已按原路径进入产物，不影响当前离线加载。
- 软件内更新相同环境验证：以 `/usr/local/bin/node v18.19.1` 和更新流程 PATH 执行 `npm run build` 已通过，包含 `beforeBuildCommand`、前端构建、Rust release 编译与 macOS App 打包。

## 5. Lint 与 CSS 污染基线

### 5.1 JavaScript

- `npm run lint:js`：通过，没有 error。

### 5.2 CSS / Stylelint

- `npm run lint:css`：失败，迁移前已有 27 个 error。
- 错误类型全部为 `no-duplicate-selectors`。
- 涉及文件：`base.css`、`components.css`、`layout.css`、`deploy.css`、`report.css`、`run.css`、`settings.css`。

### 5.3 CSS 审计

`scripts/css-audit.js` 排除第三方 `xterm.css` 后得到：

| 指标 | 基线值 |
| --- | ---: |
| 业务 CSS 文件 | 24 |
| 业务 CSS 行数 | 12,126 |
| CSS 规则 | 1,983 |
| 同文件重复定义 | 21 组 |
| 疑似无引用 class/id | 70 个，影响 136 条规则 |
| `!important` | 2,296 处 |
| 硬编码十六进制颜色 | 120 处，78 种值 |

包含第三方 `xterm.css` 的原始 `wc -l` 合计为 12,311 行。Phase 1 新建的 `frontend` 目录必须保持 0 个未经登记的 `!important`；旧 CSS 数量只记录，不在构建迁移阶段集中修复。

## 6. Sidecar 基线

- 当前端口：`127.0.0.1:13456`。
- `/api/health`：返回 `status: ok`。
- Sidecar 版本：`0.1.93`。
- 当前数据目录：`sidecar/data`。
- Tauri 通过 stdout 的 `__PORT__` 行获取动态端口，并向前端暴露 `get_sidecar_port`。
- 当前 Rust 启动逻辑包含开发机绝对路径 `/Users/ldy/personalTools/devtools-desktop/sidecar`，属于既有发布风险，不在 Phase 1 擅自修改。
- Phase 1 使用 `DEVTOOLS_TEST=1` 的隔离 Sidecar 完成 Tauri Smoke Test：测试端口为 `13900`，不会清理或占用正式后端。
- 正式 App 从 `tauri://localhost` 加载成功，并通过 Tauri IPC 动态发现测试 Sidecar 端口。
- 在真实设置页面执行“重启后端”后，测试 Sidecar PID 发生变化、端口重新接管、界面恢复“运行中”，WebSocket 再次连接成功。
- 整个测试期间正式 `13456` 后端 PID 保持不变并持续健康；测试 App 退出后 `13900` 已释放。

## 7. 数据库与设置基线

### 7.1 数据库

- 正式数据库：`sidecar/data/devtools.db`，WAL 模式。
- 迁移前在线备份：`sidecar/data/backups/devtools-20260721-134908-vue-migration-baseline.db`。
- 备份大小：21,581,824 bytes。
- 备份使用 `better-sqlite3` 在线 backup API 生成，没有复制运行中的 WAL 文件，也没有触发备份清理策略。
- 备份含用户数据，不加入 Git，不在日志或文档中展开内容。

当前代码建立 18 张表：

`projects`、`servers`、`history`、`run_history`、`todos`、`notes`、`commands`、`report_config`、`projects_json`、`notebook_notes`、`terminal_sessions`、`editor_drafts`、`usage_logs`、`usage_sync`、`model_pricing`、`pricing_candidates`、`app_settings`、`twofa_accounts`。

当前没有集中式 `PRAGMA user_version` 或单一 schema version；迁移依靠启动时逐列探测和 `ALTER TABLE` 兼容旧库。Phase 1 不修改数据库结构。

### 7.2 Web Storage key 清单

静态代码审计确认以下 localStorage key：

- `devtools-home-quote-index`
- `devtools-home-saved-quote`
- `devtools-notifications-enabled`
- `devtools-theme`
- `devtools-menu-order`
- `devtools-notes-show-weekend`
- `ft.splitRatio`
- `ft.localSort`
- `ft.remoteSort`
- `runCollapsedGroups`
- `runGroupOrder`
- `devtools-reminded-todos`
- `devtools-usage-subfee`
- `devtools-live2d-enabled`
- `devtools-click-effect-enabled`
- `deployCollapsedGroups`
- `devtools-editor-tabs`
- 动态 key：`fav_${projectName}`、`last_${projectName}`

sessionStorage key：`devtools-sidebar-collapsed`。

遵守浏览器隐私边界，本次只记录源码定义的 key，没有读取用户浏览器或 WebView 中的实际值。

## 8. 页面视觉与响应式基线

14 个页面已经在以下状态完成过截图与结构测量。截图和测量文件属于临时本地证据，提交前已清理，重新验收时按相同尺寸重新生成：

- 1665 × 1184，亮色
- 1665 × 1184，暗色
- 900 × 600，亮色

页面清单：应用首页、本地运行、部署面板、文件传输、快捷命令、待办事项、代码周报、工时内容、个人笔记、文件编辑器、纯净检测、2FA 账号列表、用量统计、系统设置。

## 9. Phase 1 零回归检查项

- [x] Vite 开发入口仍能进入全部 14 个页面。
- [x] 首页现有 Vue 岛视觉和数据加载不变。
- [x] 亮色、暗色切换不变。
- [x] 1665 × 1184 和 900 × 600 不新增横向滚动或卡片重叠。
- [x] API 动态端口发现与普通浏览器降级路径不变。
- [x] WebSocket 连接、重连与消息分发不变。
- [x] Sidecar 正常、断开、重启行为不变。
- [x] `npm run build:frontend` 生成可离线加载的 `dist`。
- [x] `npm run build` 继续生成 macOS App bundle。
- [x] `frontend` 新代码 TypeScript、ESLint、Stylelint 和单元测试通过。

### 9.1 自动化验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过；旧 CSS 27 个重复选择器错误保持登记基线，没有新增错误 |
| `npm run test:unit` | 1 个文件、2 个测试通过 |
| `npm run test:e2e` | 1 个端到端场景通过；覆盖 14 页两档窗口切换、单活动页、主题切换、单 Vue 根和横向溢出 |
| `npm run build:frontend` | 通过 |
| `npm run build` | 通过，macOS App 生成成功 |

### 9.2 浏览器与真实 App 验收

- 内置浏览器默认窗口 1665 × 1184：首页无横向或纵向溢出，内容完整铺满。
- 内置浏览器最小窗口 900 × 600：14 页均无页面级横向越界；首页 8 张卡片无相互重叠，使用页面内部纵向滚动降级。
- 默认窗口亮色、暗色均通过；任一时刻仅一个 `.page` 激活。
- 当前唯一活动 Vue 根仍是旧首页根，`#vue-migration-host` 保持隐藏且未挂载，避免 Phase 1 双根。
- 视觉证据：本地临时生成，未纳入仓库；项目 `.gitignore` 已排除对应输出目录。
- 正式构建 App：窗口、首页、用量统计切页、动态 Sidecar 端口、重启和重连均通过。

## 10. Phase 1 架构例外记录

当前首页已经通过 `src/js/vendor/vue.global.prod.js` 与 `src/js/vue/home-page.js` 创建一个旧 Vue 根实例。若 Phase 1 再直接挂载 Vite 根，将产生两个并行 Vue 根，违背最终架构目标。

Phase 1 采用以下过渡策略：

1. 创建 Vite/TypeScript/Pinia 与 `MigrationHost.vue`，但在旧首页 Vue 岛仍存在时暂缓挂载新根。
2. 当前首页 Vue 岛继续作为主应用唯一活动 Vue 根，保证 Phase 1 不改变业务页面。
3. Phase 2 的组件预览使用独立开发入口，不在旧应用壳中创建第二个根。
4. Phase 3 首页正式迁移为 SFC 时，由新根一次性接管首页并删除全局 Vue runtime 与旧挂载代码。

这不是最终双根方案，而是为满足“Phase 1 只换构建、不改业务”的显式兼容门禁。

## 11. Phase 1 已知问题与后续门禁

1. 旧 `js/vendor/codemirror/cm.bundle.js` 仍会产生既有 `defineSimpleMode` 控制台错误；它发生在新 Vite 模块加载前，登记为旧 bundle 基线，不在 Phase 1 扩大范围修复。
2. Vite 对 classic script 与运行时 CSS 路径的构建警告会持续到对应页面和第三方依赖正式模块化；当前产物已验证完整。
3. 当前工作区包含迁移前的多项混合修改，未执行 reset、stash 或自动提交。
4. G1 的代码、自动化、内置浏览器和 Tauri 技术门禁已通过；这些结果不能替代用户手动 E2E，当前用户验收状态为“待确认”。
5. 软件内更新曾因 Vite 8/Rolldown 调用 Node 18 不具备的 `node:util.styleText` 而失败；已通过锁定 Node 18 兼容且无已知漏洞的工具链版本修复。用户需要重新执行一次“重新打包并更新”完成最终手动验证。
6. 计划要求的独立本地 commit 仍需用户明确授权，当前未创建、未推送。
7. Phase 2 尚未开始。进入 Phase 2 后只建立 service、store、Token、主题和已确认的首批公共组件，不迁移业务页面；任何业务页仍必须先通过 PG0～PG3。
