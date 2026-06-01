# Requirements Document

## Introduction

本规格用于规划 DevTools Desktop（当前版本 0.1.75）的一轮**代码优化与重构**工作。目标是在**不改变现有功能与用户体验**的前提下，消除可移植性障碍、降低维护成本、收敛重复代码、修复明显的工程隐患，使项目从"绑定作者本机"演进为"任意 macOS 机器可构建运行"的可维护代码库。

项目架构为：Tauri 2.x（Rust 外壳）+ Node.js Sidecar（Express + ws）+ 原生 HTML/CSS/JS 前端，本地 SQLite（better-sqlite3）存储。Sidecar 仅绑定 `127.0.0.1`，定位为个人用桌面开发工具集。

需求按优先级分为三组，便于逐步推进实施：

- **P0（最高优先级）**：影响可移植性与基本可维护性，不改几乎绑死在作者本机。
- **P1（高优先级）**：显著降低维护成本和安全风险。
- **P2（中优先级）**：代码质量与工程化提升。

每条需求均独立可验证。所有重构都必须遵守"行为等价"这一贯穿性约束（见文末 [贯穿性约束](#贯穿性约束)）。需求 1–4 属 P0，需求 5–8 属 P1，需求 9–15 属 P2。

## Glossary

- **DevTools_App**：整体桌面应用，由 Tauri Rust 外壳进程托管。
- **Rust_Shell**：Tauri 主进程（`src-tauri/src/lib.rs`），负责 spawn 并管理 Sidecar、提供托盘与窗口、向前端暴露 `get_sidecar_port` 等命令。
- **Sidecar**：Node.js 后端服务（`sidecar/index.js`），提供 HTTP API 与 WebSocket，仅绑定 `127.0.0.1`。
- **Config_Module**：拟新增的 Sidecar 统一配置模块，集中解析环境变量、`os.homedir()` 与可配置项。
- **Scan_Root**：扫描候选项目的根目录（当前硬编码为 `/Users/ldy/project`）。
- **Deploy_Lock**：拟新增的后端并发互斥机制，按项目名约束同一项目的构建/部署任务。
- **SSH_Module**：拟新增的统一 SSH 连接服务（`services/ssh.js`），提供 `createConnection(serverConfig)`。
- **Repository_Layer**：拟新增的统一数据访问层，封装项目/服务器/历史的读写。
- **Command_Executor**：快捷命令执行能力（`routes/commands.js` 的 `/exec`）。
- **Local_Token**：Sidecar 启动时生成的本地访问令牌，用于校验 API 调用来源。
- **Resource_Dir**：Tauri 打包后由 `resource_dir()` 解析的应用资源目录。
- **Behavior_Equivalence（行为等价）**：重构前后，对相同输入产生相同可观察输出、相同副作用、相同用户可见行为。

---

## Requirements

### P0 — 可移植性与基本可维护性

### Requirement 1: 消除硬编码绝对路径（Sidecar 配置统一化）

**User Story:** 作为开发者，我希望 Sidecar 不再依赖写死的 `/Users/ldy/...` 路径，以便在任意 macOS 机器或任意用户名下都能正常运行。

#### Acceptance Criteria

1. THE Config_Module SHALL 通过 `os.homedir()` 解析用户主目录，而非任何写死的 `/Users/ldy` 字面量。
2. WHERE 环境变量提供了对应配置项，THE Config_Module SHALL 优先采用环境变量的值。
3. WHERE 环境变量未提供对应配置项，THE Config_Module SHALL 采用基于 `os.homedir()` 推导的默认值。
4. THE Sidecar SHALL 通过 Config_Module 获取 Scan_Root、用户主目录与应用安装路径，而非在各路由内各自硬编码。
5. WHEN 在用户名非 `ldy` 的 macOS 机器上启动 Sidecar，THE Sidecar SHALL 成功完成启动并输出 `__PORT__:<port>`。
6. THE 代码库 SHALL 在 `sidecar/` 目录下不包含任何 `/Users/ldy` 字面量。

### Requirement 2: 扫描根目录可配置并持久化

**User Story:** 作为开发者，我希望扫描候选项目的根目录是一个可配置的设置项并存入数据库，以便不同机器使用各自的项目目录。

#### Acceptance Criteria

1. THE Sidecar SHALL 将 Scan_Root 作为设置项存储于 SQLite 数据库。
2. WHEN 读取候选项目列表且数据库未配置 Scan_Root，THE Config_Module SHALL 返回基于 `os.homedir()` 推导的默认 Scan_Root。
3. WHEN 用户通过设置接口更新 Scan_Root，THE Sidecar SHALL 持久化新值，并在后续候选项目扫描中使用该值。
4. IF 配置的 Scan_Root 在文件系统中不存在，THEN THE Sidecar SHALL 返回空候选列表且不抛出未捕获异常。
5. THE `services/scanner.js` SHALL 从 Config_Module 获取 Scan_Root，而非使用模块级常量 `DEFAULT_SCAN_ROOT = '/Users/ldy/project'`。

### Requirement 3: Rust 侧通过 Resource 目录解析 Sidecar

**User Story:** 作为开发者，我希望打包后的应用通过 Tauri Resource 目录定位 Sidecar，而非依赖源码绝对路径，以便正式安装包能在任意机器运行。

#### Acceptance Criteria

1. WHEN DevTools_App 以打包安装形态启动，THE Rust_Shell SHALL 通过 Resource_Dir 解析 Sidecar 入口文件路径。
2. THE Rust_Shell SHALL 不使用写死的 `/Users/ldy/personalTools/devtools-desktop/sidecar` 路径定位 Sidecar。
3. IF 解析得到的 Sidecar 入口文件不存在，THEN THE Rust_Shell SHALL 记录错误日志并以端口 `0` 注册 Sidecar 状态，避免进程崩溃。
4. WHEN 解析 Node 可执行文件路径，THE Rust_Shell SHALL 按候选列表依次尝试，且候选列表中通过 `os.homedir()` 等价方式推导 nvm 路径，而非写死 `/Users/ldy/.nvm/current/bin/node`。
5. THE Sidecar 入口文件及其运行所需资源 SHALL 被纳入 Tauri `bundle.resources` 配置，使打包产物包含 Sidecar。
6. WHEN DevTools_App 在打包形态下启动，THE Rust_Shell SHALL 成功 spawn Sidecar 并从其 stdout 读取到端口号。

### Requirement 4: 后端并发构建/部署互斥锁

**User Story:** 作为开发者，我希望后端对同一项目的构建/部署任务强制互斥，以便即使前端 `busyProjects` 防重失效或被绕过，也不会同时运行两个构建。

#### Acceptance Criteria

1. WHEN 收到针对某项目的 `/api/deploy/build` 或 `/api/deploy/start` 请求，THE Deploy_Lock SHALL 以该项目名为键检查是否已有进行中的任务。
2. IF 同一项目已存在进行中的构建或部署任务，THEN THE Sidecar SHALL 拒绝新请求并返回明确的冲突状态码（HTTP 409）与说明信息。
3. WHEN 某项目的构建或部署任务完成（成功、失败或异常终止），THE Deploy_Lock SHALL 释放该项目对应的锁。
4. WHILE 某项目持有 Deploy_Lock，THE Sidecar SHALL 允许其他不同项目名的构建或部署任务并发执行。
5. IF 持锁任务因未捕获异常中断，THEN THE Deploy_Lock SHALL 在任务终结回调中释放锁，避免锁永久泄漏。
6. THE Deploy_Lock SHALL 在不改变单任务成功路径下既有日志输出与 WebSocket 广播行为的前提下生效。

### P1 — 维护成本与安全风险

### Requirement 5: 统一 SSH 连接服务

**User Story:** 作为开发者，我希望将重复的 SSH 连接配置抽取为统一服务，以便所有调用方复用同一份认证与连接逻辑。

#### Acceptance Criteria

1. THE SSH_Module SHALL 提供 `createConnection(serverConfig)` 接口，返回解析为已就绪 ssh2 `Client` 的 Promise。
2. THE SSH_Module SHALL 在内部统一实现 `connectConfig`、`authHandler`（password / keyboard-interactive 回退）与密码解密逻辑。
3. THE `services/deployer.js`、`routes/deploy.js`（preflightCheck）、`routes/servers.js`（quick-test / test / browse）SHALL 通过 SSH_Module 建立连接，而非各自内联重复的连接逻辑。
4. IF SSH 连接在 60 秒内未就绪，THEN THE SSH_Module SHALL 以超时错误拒绝（reject）该 Promise。
5. WHEN 复用统一 SSH 连接后，THE Sidecar SHALL 保持现有部署、预检、连接测试与目录浏览的可观察行为不变。
6. THE 代码库 SHALL 不再存在 5 处重复的 `connectConfig + authHandler + keyboard-interactive` 内联实现。

### Requirement 6: 统一数据访问层

**User Story:** 作为开发者，我希望项目/服务器/历史的读写逻辑收敛到统一的数据访问层，以便消除各路由各写一份的重复实现。

#### Acceptance Criteria

1. THE Repository_Layer SHALL 提供项目（projects）的读取与写入接口，封装 `projects_json` 表的访问。
2. THE Repository_Layer SHALL 提供服务器（servers）的读取与写入接口，封装 `servers` 表的访问与密码字段序列化。
3. THE Repository_Layer SHALL 提供历史（history / run_history）的读取与追加接口。
4. THE `routes/deploy.js`、`routes/run.js`、`routes/projects.js`、`routes/servers.js` SHALL 通过 Repository_Layer 读写数据，而非各自实现 `readJSON` / `readProjects` / `readServers`。
5. WHEN 通过 Repository_Layer 读取数据，THE Sidecar SHALL 返回与重构前在字段结构、类型转换（如 `port` 转 Number、`deployPaths` 解析）和顺序上等价的结果。

### Requirement 7: 快捷命令 sudo 密码安全加固

**User Story:** 作为开发者，我希望 sudo 密码通过子进程 stdin 传入而非拼接进命令行，以便避免密码在进程列表中短暂可见。

#### Acceptance Criteria

1. WHEN Command_Executor 执行以 `sudo ` 开头且已配置 sudo 密码的命令，THE Command_Executor SHALL 通过子进程 stdin 写入密码，而非将密码拼接进命令字符串。
2. THE Command_Executor SHALL 不在传给 shell 的命令字符串中包含 sudo 密码明文。
3. WHEN sudo 命令执行完成，THE Command_Executor SHALL 保持现有的输出脱敏行为（移除 `Password:` 与 `[sudo] password` 提示）。
4. IF 命令执行超过 30 秒，THEN THE Command_Executor SHALL 终止该命令并返回超时说明。
5. THE Command_Executor 的边界与"任意命令执行属个人工具特性"的说明 SHALL 在代码注释或文档中明确记录。
6. WHEN 使用 stdin 方式传入密码后，THE Command_Executor SHALL 保持现有 sudo 命令的成功执行结果不变。

### Requirement 8: API 访问来源校验

**User Story:** 作为开发者，我希望 Sidecar 校验请求来源而非对所有来源开放，以便本机任意网页无法随意调用命令执行等敏感 API。

#### Acceptance Criteria

1. THE Sidecar SHALL 在启动时生成一个 Local_Token。
2. THE Rust_Shell SHALL 向前端暴露获取 Local_Token 的途径，使前端可在请求头中携带该令牌。
3. WHEN 收到 API 请求，THE Sidecar SHALL 校验请求来源（校验 Origin 或校验请求头中的 Local_Token）。
4. IF 请求未通过来源校验，THEN THE Sidecar SHALL 拒绝该请求并返回未授权状态码（HTTP 401 或 403）。
5. WHEN 请求来自 DevTools_App 自身的前端，THE Sidecar SHALL 正常处理该请求，保持现有功能不变。
6. THE Sidecar SHALL 继续仅绑定 `127.0.0.1`，且 CORS 配置不再对所有来源无条件返回 `Access-Control-Allow-Origin: *`。

### P2 — 代码质量与工程化

### Requirement 9: 收敛重复的工具函数

**User Story:** 作为开发者，我希望重复的工具函数被收敛为单一实现，以便降低维护成本并消除实现漂移。

#### Acceptance Criteria

1. THE Sidecar SHALL 提供单一的 `formatDuration` 实现，并由 `services/builder.js` 与 `routes/run.js` 共同复用。
2. THE 前端 `src/js/api.js` SHALL 提供内部统一的 `request(method, url, data)` 实现，`get` / `post` / `put` / `del` 方法均委托该实现。
3. WHEN 收敛后调用 `formatDuration`，THE Sidecar SHALL 对相同输入返回与原 `services/builder.js` 实现一致的格式化结果。
4. WHEN 前端任一请求方法遇到超时或连接失败，THE 前端 SHALL 保持与重构前一致的错误信息（"请求超时，请检查 Sidecar 状态" / "无法连接 Sidecar 服务"）。
5. THE 前端 SHALL 继续保留 `API.delete` 指向 `API.del` 的向后兼容别名。

### Requirement 10: 数据库写入改为针对性更新

**User Story:** 作为开发者，我希望服务器与项目的更新采用针对性 UPDATE / 单行 upsert / 条件 DELETE，以便避免每次改动都全表删除重插。

#### Acceptance Criteria

1. WHEN 更新单个服务器配置，THE Sidecar SHALL 仅对该服务器对应行执行 UPDATE，而非 `DELETE FROM servers` 全量重插。
2. WHEN 删除单个服务器，THE Sidecar SHALL 执行 `DELETE FROM servers WHERE id = ?`。
3. WHEN 更新单个项目配置，THE Sidecar SHALL 对该项目执行单行 upsert（`INSERT OR REPLACE` 单行），而非先 `DELETE FROM projects_json` 再整表重建。
4. THE Sidecar SHALL 在不依赖 rowid 维持顺序的前提下，提供稳定且确定的项目/服务器列表顺序。
5. WHEN 执行针对性写入后，THE Sidecar SHALL 保持读取接口返回的数据内容与重构前等价。

### Requirement 11: 消除请求处理函数内部的 require

**User Story:** 作为开发者，我希望模块依赖统一在文件顶部声明，以便提高可读性并避免运行时重复 require。

#### Acceptance Criteria

1. THE `routes/projects.js` SHALL 在文件顶部声明 `child_process` 依赖，git-log 处理函数不再在内部 require。
2. THE `routes/servers.js` SHALL 复用文件顶部已声明的 `ssh2` `Client`，quick-test 处理函数不再在内部重复 require。
3. WHEN 提升 require 后，THE 受影响接口 SHALL 保持与重构前一致的响应行为。

### Requirement 12: 引入测试框架与单元测试

**User Story:** 作为开发者，我希望为纯函数补充单元测试并接入测试框架，以便回归验证关键解析与判定逻辑。

#### Acceptance Criteria

1. THE Sidecar SHALL 接入一个测试框架，且 `sidecar/package.json` 的 `test` 脚本 SHALL 执行测试套件，而非 `echo "Error: no test specified" && exit 1`。
2. THE 测试套件 SHALL 覆盖 `services/scanner.js` 的多模块识别与 excludeModules 解析。
3. THE 测试套件 SHALL 覆盖 `services/gitlab.js` 的 commit 解析逻辑。
4. THE 测试套件 SHALL 覆盖 `routes/ipcheck.js` 的风控分级逻辑。
5. THE 测试套件 SHALL 覆盖 `services/deployer.js` 的 `posixJoin` 路径拼接与上传策略（root / folder）选择逻辑。
6. WHEN 运行 `npm test`，THE 测试套件 SHALL 在不依赖外部 SSH 服务器或网络的前提下完成执行。

### Requirement 13: 引入 lint 与格式化工具

**User Story:** 作为开发者，我希望项目接入 eslint 与 prettier，以便统一代码风格并尽早发现明显问题。

#### Acceptance Criteria

1. THE 项目 SHALL 包含 eslint 配置与 prettier 配置。
2. THE 项目 SHALL 提供可执行的 lint 脚本。
3. WHEN 运行 lint 脚本，THE lint 工具 SHALL 对 `sidecar/` 与 `src/` 下的 JavaScript 源文件执行检查。

### Requirement 14: 清理残留与占位逻辑

**User Story:** 作为开发者，我希望清理空目录与临时占位逻辑，以便代码库不残留误导性内容。

#### Acceptance Criteria

1. THE 代码库 SHALL 移除空目录 `sidecar/services/quota/`，或为其补充明确用途的内容。
2. WHERE `routes/upgrade.js` 的 `/check` 接口处于"本地源码模式"而恒返回 `hasUpdate: false`，THE 接口 SHALL 在代码注释或返回文案中明确标注该模式为有意为之的临时状态。
3. WHEN 调用 `/api/upgrade/check`，THE 接口 SHALL 保持现有返回结构（`hasUpdate` / `version` / `commits`）不变，除非显式落地真正的版本检查。

### Requirement 15: 前端状态收口与重复判定抽取

**User Story:** 作为开发者，我希望将散落的全局变量收口为单一 state 对象，并抽取重复的当前任务匹配判定，以便降低 `app.js`（约 1056 行）的维护复杂度。

#### Acceptance Criteria

1. THE 前端 SHALL 将原散落的全局变量（如 projects / servers / runningProjects 等）收口至单一 state 对象。
2. THE 前端 SHALL 提供统一的当前任务判定函数，用于 WebSocket handler 中基于 `data.id` 的当前任务匹配。
3. THE WebSocket handler SHALL 通过该统一判定函数判断消息归属，而非散落地内联比较 `data.id`。
4. WHEN 完成状态收口与判定抽取后，THE 前端 SHALL 保持所有页面交互、运行/构建/部署状态展示与日志回放行为不变。

---

## 贯穿性约束

以下约束适用于本规格的**所有**需求，是每条需求验收的前置条件：

1. **行为等价（不破坏现有功能）**：每一项重构完成后，DevTools_App 对相同输入 SHALL 产生与重构前一致的可观察输出、副作用与用户可见行为（Behavior_Equivalence）。
2. **阶段独立可验证**：每个需求 SHALL 可独立验证，验证方式为：Rust 与 Sidecar 构建通过，且相关功能通过手测或单元测试确认未回归。
3. **保持定位**：所有变更 SHALL 维持"个人工具、仅本机（`127.0.0.1`）"的定位，不为安全做过度设计，但 SHALL 消除明显隐患（如命令行明文密码、来源无校验）。
4. **不引入破坏性数据迁移**：涉及数据库写法调整的需求 SHALL 保持既有 SQLite 数据可继续读取，不要求用户清空或重建数据库。
