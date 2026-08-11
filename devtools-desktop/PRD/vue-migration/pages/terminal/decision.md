# 快捷命令 / 终端页面迁移决策

> 状态：**PG0～PG5 已完成，Phase 7-2 已关闭**（2026-08-11）；用户 Tauri 验收通过，legacy 已删
> 关联评估：[assessment.md](./assessment.md)
> 产出日期：2026-08-11

本文含 PG2 建议与 PG3 冻结范围。PG4 不得静默扩大；新想法回退 PG2/PG3。

## 1. 必须保持等价

1. **切走页面 ≠ 关 PTY / ≠ 销毁 xterm**（同 WS 内保活；切回 fit+focus）
2. 每 tab 独立 Terminal + Fit + Search +（可选）WebGL
3. 关 tab → dispose 前端 + `terminal-close` + 删 session 行；关到 0 → 自动新建
4. 命令卡片每次执行时**新开终端 tab** 并注入命令（不打进当前可能正忙的 tab）；仍不走 `/api/commands/exec`
5. Cold restore：`GET /sessions` 建 tab 再 `terminal-init`；不恢复 scrollback/进程
6. WS 断线杀光该连接 PTY；重连对各 tab 再 init（**新 shell**）——本轮不宣称「进程级重连」
7. 清除 / 重置 / 全屏搜索 / sudo 存取行为等价
8. 本地偏好与 session 表键语义保持

## 2. 架构必修（L0 也要做）

| 编号 | 项 |
| --- | --- |
| A1 | `TerminalView` + `TerminalTabs` + `XtermPane`（或等价拆分） |
| A2 | composable：创建/销毁顺序 addon → terminal → observer → `WS.off` |
| A3 | KeepAlive / 隐藏页：不杀 PTY；激活时 fit |
| A4 | `terminal-service` + `commands-service`；会话权威在 Sidecar |
| A5 | WebGL context lost → dispose addon → 2D 降级 + toast（可测） |

## 3. L1 建议纳入（推荐）

| 编号 | 项 |
| --- | --- |
| D3 | 窗口 / 容器 resize **防抖** 后再 `fit` + `terminal-resize` |
| V1 | PageFrame / 按钮 / Dialog / Confirm；标题去 emoji |
| V2 | 命令网格与终端面板组件边界清晰；去掉 HTML `onclick` 拼串 |
| V3 | `!important` 收敛到确有必要的 xterm 覆盖并注释 |

## 4. 默认不做

- L2：可拖分隔条、终端区弹性布局重做（需原型）
- L3：命令编辑 UI、接线 `/exec`、进程级断线恢复、sudo 存储方案大改、升 xterm 大版本

## 5. 分级

| 等级 | 内容 | 评价 |
| --- | --- | --- |
| L0 | 仅 A1～A5 | 可过门禁，但缺防抖与视觉统一 |
| **L1（推荐）** | A1～A5 + D3 + V1～V3 | 对齐 Phase 7；**无需 HTML 原型** |
| L2 | 可拖 splitter / 高度布局 | 需亮暗原型 |
| L3 | 编辑命令 / `/exec` / 真进程恢复等 | 独立子阶段 |

**推荐：L1。**  
PG3 须书面确认：**切页保留 PTY（现状）**；**不**把 WS 重连当成同一进程恢复。

## 6. PG3 用户确认结论（2026-08-11）

用户反馈「测试完成了，没有问题」，采纳推荐方向：

1. **优化等级 L1**：A1～A5 + D3（resize 防抖）+ V1～V3。
2. **切页保 PTY**：保持现状（切走 ≠ 杀进程 / ≠ 销毁 xterm）。
3. **D4**：接受 WS 重连 = 新 shell（不宣称进程级恢复）。
4. **L2/L3 全部不做**（无可拖分隔条、无命令编辑、无 `/exec` 接线、不升 xterm 大版本）。
5. **不需要 HTML 原型**；直接进 PG4。

## 6.2 PG4 后交互增补（2026-08-11）

用户 Tauri 手测通过后提出：快捷命令若注入当前/第一个终端，长任务会挡住输出。

**确认变更（纯前端、低风险，记为 L1 增补）**：点击「执行」→ `runCommandInNewTab`——新建 tab（名用命令名）→ 短暂等待壳就绪 → 向该 tab 注入命令。手动「+」仍只建空 tab；不改 PTY 协议。

## 6.1 原确认清单（已关闭）

~~1. 等级：`L1（推荐）` / 其它  
2. 切页保 PTY：`保持现状（推荐）` / 改为切页也杀  
3. D4 重连=新 shell：`接受并写进验收（推荐）` / 要做 L3  
4. L2/L3：`全部不做（推荐）` / 指定项  
5. 原型：L1 下 `不需要（推荐）`~~


## 7. PG5 与关闭（2026-08-11）

用户确认 Vue 页 Tauri 手测无问题（含「执行快捷命令新开 tab」增补）后执行：

- 删除 `src/js/terminal.js`、`src/css/pages/terminal.css`
- 移除 `index.html` 对二者的 link/script
- 保留 xterm UMD 与 `xterm.css`
- 正式实现：`views/terminal/`、`terminal-runtime-service`、commands/terminal service、Pinia store
