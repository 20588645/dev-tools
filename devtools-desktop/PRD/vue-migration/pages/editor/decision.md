# 文件编辑页面迁移决策

> 状态：**PG0～PG5 已完成，Phase 7-1 已关闭**（2026-08-11）；用户 Tauri 手测通过，legacy 已删
> 关联评估：[assessment.md](./assessment.md)
> 产出日期：2026-08-11

本文含 PG2 建议与 PG3 冻结范围。PG4 不得静默扩大；新想法回退 PG2/PG3。

## 1. 必须保持等价

1. CodeMirror **5.65.16**（本轮不升 CM6）
2. 单 CM 实例 + 多 `Doc` 标签（`swapDoc`）
3. 草稿 DB（`editor_drafts`）+ `localStorage['devtools-editor-tabs']`（仅真实文件路径）
4. 应用内 browse 弹窗（无原生 OS 文件框）；与 `/api/fs/local` 分家
5. EOL：读入 LF，写出还原原 CRLF
6. 查找/替换快捷键与现 addon 行为
7. 关脏 tab / 批量关确认；空草稿无内容不算脏
8. 关最后一 tab → 自动新草稿（等价保留）
9. 日志「打开编辑器」仍走外部 `/api/run/open-editor`，不改成本页默认

## 2. 架构必修（L0 也要做）

| 编号 | 项 |
| --- | --- |
| A1 | `EditorView` + `CodeMirrorPane`；mounted 后创建 CM |
| A2 | unmount / 停用时清理主题 Observer、快捷键、CM 引用；反复进出不泄漏实例 |
| A3 | KeepAlive / 再激活时 `refresh`（ResizeObserver 或 onActivated） |
| A4 | `editor-service.ts` 类型化现用 API；文档会话可进轻量 store 或 composable |
| A5 | 打开/另存 browse → Vue `BaseDialog`，去掉 HTML `onclick` 拼路径 |

## 3. L1 建议纳入（推荐）

| 编号 | 项 |
| --- | --- |
| D1 | **离开「文件编辑」页时若有脏标签 → 确认**（补齐 Phase 7 验收；今日无此行为） |
| V1 | 页壳 `PageFrame` / `PageHeader` / 按钮组件化；标题去 emoji（📝） |
| V2 | Toast / Confirm / Prompt 走通知与 Dialog |
| V3 | 状态栏、标签栏视觉与全站 token 对齐（不重做信息架构） |

## 4. 默认不做

- L2 重设计标签/空态/布局（除非你要原型）
- L3：外部 mtime 监视（`stat`）、默认把日志打开改到应用内编辑器、升 CM6、与 notebook 合并

## 5. 分级

| 等级 | 内容 | 评价 |
| --- | --- | --- |
| L0 | 仅 A1～A5，切页仍无脏确认 | 不推荐：留下 D1 验收缺口 |
| **L1（推荐）** | A1～A5 + D1 + V1～V3 | 符合 Phase 7 门禁；无布局重做，**无需 HTML 原型** |
| L2 | 重做标签条/空态/工具栏结构 | 需亮暗原型 |
| L3 | mtime / 日志进本页 / CM6 等 | 独立子阶段 |

**推荐：L1。**

## 6. PG3 用户确认结论（2026-08-11）

用户回复「确认」，采纳推荐方向：

1. **优化等级 L1**：A1～A5 + D1（切页脏确认）+ V1～V3。
2. **保持 CM5**，不升 CM6。
3. **L2/L3 全部不做**（无布局重做、无 mtime 监视、不改日志外部打开）。
4. **不需要 HTML 原型**；直接进 PG4。

## 6.1 原确认清单（已关闭）

~~1. 等级：`L1（推荐）` / 其它  
2. D1 切页脏确认：`纳入本轮（推荐）` / 不做  
3. L2/L3：`全部不做（推荐）` / 指定项  
4. 原型：L1 下 `不需要（推荐）`~~


## 7. PG5 与关闭（2026-08-11）

用户确认真实 Tauri 手测无问题后执行：

- 删除 `src/js/editor.js`、`src/css/pages/editor.css`
- 移除 `index.html` 对二者的 link/script
- 保留 `src/js/vendor/codemirror/*`（CM5 全局 bundle）
- 正式实现：`views/editor/`、`stores/editor.ts`、`editor-service.ts`、页面离开守卫桥
