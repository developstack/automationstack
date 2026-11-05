# 更新日志

本文件记录 automationstack 所有值得留意的变更。

格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

### 移除

- **Jira 集成**：删除项目级配置、issue 创建与关联、状态同步 webhook，以及设置页的「Jira 集成」页签。
  同时删除只为 Jira 服务的缺陷字段：用例执行记录上的缺陷编号、状态、标题和链接，
  测试报告不再列出这几列。迁移 `0021` 会删除 `jira_configs` 表和执行记录上的四个缺陷列。

## [1.0.0] - 2026-09-03

首个正式版本。测试用例管理平台：用例的编写、评审、组织成测试任务、执行结果回流，
外加两条平台之外的入口——本地 agent 经 MCP / skill 写入用例，自动化测试经上报 SDK
把结论写回用例。

### 新增

- **用例管理**：模块树 + 用例列表 + 用例抽屉，用例版本历史，批量导入（单批上限
  `IMPORT_BATCH_LIMIT = 50` 条），附件走预签名直传（需配置 R2 / S3 兼容存储）。
  被测试任务引用的用例不删除，改「废弃」状态。
- **脑图画布**：模块与用例的新建、改名、移动、删除在画布上直接做，成批提交
  （单批上限 `MINDMAP_BATCH_LIMIT = 100` 个操作），服务端全有或全无地应用。
- **测试任务与执行台**：用例级结论之外支持**分步判定**——步骤逐条判定并由分步结果
  推导用例级结论，带 P/F/B/S 快捷键、跨刷新保留的本机草稿（用例版本变了即作废）、
  分步汇总条。执行结论面板置顶可折叠，用例详情面板上半是「这次执行」、下半是
  「用例本身」。
- **测试报告**：通过率与结论分布、失败清单，以及自动化视图（自动化条数、刷新条数、
  跳过条数、每条失败的执行来源）。
- **项目概览**：总数与状态环图、优先级分布、模块通过/失败竖柱图、覆盖缺口。
- **认证与权限**：手写会话认证（会话 7 天，无滑动续期），平台用户管理页，项目成员
  模型与项目级授权，并把 MCP、WebSocket、ingest 三条旁路一并纳入同一套授权。
- **实时协作**：`/ws` 上的 WebSocket 房间，在线成员与用例编辑占用提示。
- **本地 agent 接入**：`/mcp` 上的无状态 Streamable HTTP MCP 端点
  （`Authorization: Bearer <API Token>` 鉴权），配套 `testcase-authoring`
  与 `testcase-migration` 两份 skill，以及 `install-agent-skill.sh` 一键安装脚本
  （覆盖 Claude Code / Codex / pi / opencode / zcode，脚本自身从不接触 token 值）。
- **个人 API Token**：明文只在创建时出现一次，库里只存 SHA-256。
- **自动化结果回流**：`/ingest` 端点与四个上报包——`@automationstack/sdk`（Node）、
  `automationstack-sdk`（Python）、`pytest-automationstack`（pytest 插件）、
  `org.automationstack:sdk`（Java）。四份实现零运行时依赖，批量上报后打印逐条对账单，
  归属只认用例的 `sourceRef`，测试代码本身不用改。
- **示例工程**：`examples/nodejs`（node:test / vitest / WebdriverIO）、
  `examples/python`（pytest）、`examples/jdk`（JUnit 5），配套幂等的
  `pnpm db:seed-automation-demo` 种子脚本。
- **Jira 集成**：缺陷创建与关联、项目级配置、webhook 回写。
- **后台任务**：基于 pg-boss 的每日报告自动提交扫描。
- **部署与流水线**：docker compose（`postgres` / 一次性 `migrate` / `server` / `web`）、
  两份 Dockerfile、三份 `.env.example`；GitHub Actions 跑类型检查、单元测试、
  Biome/Ultracite、ESLint、仓库自有门禁，并按 web / server 两个矩阵推 GHCR；
  SDK 发布流水线推 GitHub Packages。
- **Apache-2.0 LICENSE**，各 SDK 的包元数据同步声明授权。

### 变更

- **导航重构**：登录后先选项目，项目内一级侧栏 + 按段显示的模块面板；全局侧栏退役，
  设置收编为项目内的分 tab 页面。
- **用例生成改为本地 agent 接入**（破坏性）：删除平台内置的在线 AI 供应商配置、
  `packages/agent` 与 `packages/ai` 两个包及相关路由；迁移 `0013` 删除
  `ai_case_proposals` / `ai_generation_sessions` / `ai_provider_config` 三张表与两个枚举。
  生成能力改由用户自己的本地 agent 经 MCP / skill 完成。
- **docker compose 不再有弱口令兜底**（破坏性）：`POSTGRES_PASSWORD` 由 `:-password`
  改为 `:?`，未设置时 compose 直接拒绝启动；`apps/server/.env` 由
  `required: false` 改为 `required: true`；Postgres 的宿主机端口由 `5433:5432`
  收窄为 `127.0.0.1:5433:5432`。
- **版本号与授权统一**：四个 SDK 与 `examples/jdk` 从 `0.1.0` 提到 `1.0.0`，
  两个 Python 包的 license 由 `UNLICENSED` 改为 `Apache-2.0`；
  `apps/server`、`packages/api`、`packages/db` 显式标记 `private`。
- **UI**：九个组件从裸 Base UI 换成 Animate UI（底子仍是 Base UI）；页面转场改纯淡入；
  主题切换加揭示动效；404 页改用乱码翻牌效果；接入指南整篇重写。
- **性能**：recharts 改按需加载，约 101KB gzip 移出首屏必经路径；执行台用例清单加两层
  memo，挡住不分页列表的全量重渲。
- **README 重写**，把「它和别的用例管理工具不一样在哪」「构建期变量的坑」「迁移只能手动跑」
  这些踩过的地方写在明面上。

### 修复

- **会话过期后自动跳登录页**并带上回跳地址。原先「会话没了」只有导航时那道 `beforeLoad`
  闸门发现得了，而窗口重新聚焦触发的 `auth.me` 重取拿到 `null` 时一次网络错误都不会发生——
  停在页面上的人只看到一个转不完的 spinner。同时不再让整屏查询各弹一条「请先登录」toast。
- **删除模块时的引用保护**。`modules.parentId` 与 `test_cases.moduleId` 都是级联删除，
  而 `test_run_cases.caseId` 是 restrict：删一个模块会连带删掉整棵子树的用例，撞上引用时
  数据库只给一个 23503，既说不出是谁挡住的，又会把整个事务连坐掉（脑图批量路径下就是
  最多 100 个操作一起回滚）。现在删之前先查整棵子树的引用，被挡住时返回结构化拒绝，
  文案点名是哪个模块、多少条用例、被多少个测试任务引用，并提示改「废弃」状态。
- **脑图批量失败给出具体原因**。原先一律是「脑图同步失败，已恢复为服务端数据」，
  用户只能一个个试才知道是哪一项被拒；现在服务端把失败码翻成中文，前端只透出契约里
  声明过的业务错误，非预期错误仍回落到通用文案。
- **执行台的滚动与高度**一系列整改：整页滚动、变更历史下方那片空白、用例区高度、
  越狱的 `sr-only` 绝对定位、五页居中窄列的滚动条归位视口、折叠区开合动画。
- 执行台快捷键的一处越权 bug。
- 自动化接管手工结论时补上审计流水，并接通报告页两张解释卡。
- pg-boss 的生命周期与配置校验四处修正。
- `package.json` 依赖版本白名单门禁的四条失效路径，并清掉它漏进来的存量违规。
- 清掉全仓 ESLint 的 44 个存量 error（函数行数 / 圈复杂度 / consistent-return）。
- **CI 不再可能空跑成假绿**：`check-tailwind` / `check-file-rules` 传空文件列表时只会打印
  「没有文件需要检查」然后 exit 0，日志上和「全过了」一字不差；现在调用前先断言两张文件
  列表非空，并把 `check-package-json` 一并接进这一步。同理，`vitest` 的 project `root`
  指向不存在的目录时会静默跳过、退出码仍是 0——`packages/agent` 与 `packages/ai` 被删后
  那两个 project 就这么在 main 上绿了一段时间，现在配置里只留实际存在的五个
  （web / api / server / db / sdk），并把「输出里必须出现 5 个 project」写成要核的约定。

### 安全

- **登录接口限流**。`auth.login` 每次请求都无条件跑一次 600k 迭代的 PBKDF2（实测约 75ms，
  走 libuv 线程池），而为了不泄露用户名是否存在，不存在的用户名也照跑一次诱饵散列——
  于是任意字符串都能触发这份开销，几十路并发就能占满 Node 默认 4 条的线程池。现在在
  **读库与 KDF 之前**加三道闸：
  - `(IP, 用户名)` 连续失败指数退避：连错 5 次起锁，首次 30 秒，之后每失败一次翻倍，
    上限 15 分钟（不做永久锁，否则拿一个已知用户名就能把真人关在门外）；
  - 单 IP 滑动窗口：1 分钟内最多 10 次真正跑到 KDF 的尝试；
  - 全局并发位：同时最多 2 路口令校验在跑，满了直接回 429 而不是排队。
  对外只有一句「登录尝试过于频繁，请稍后再试」，不区分是哪道闸拒的，不给用户名枚举留线索；
  用户名不存在、口令错、账号停用三种失败一律计数，口径不分叉。
- **全站请求体上限**。oRPC 的 StandardHandler 会在 `requireUser` 之前就把请求体读完并解析，
  「先鉴权再读体」在那条路径上根本不成立——一个不带 cookie 的 `POST /rpc/auth/login`
  就足以把任意大的体灌进内存，而 compose 里 server 前面没有任何反向代理能兜这一层。
  新增按路由族分档的中间件，挂在 cors 之后、所有读体逻辑之前：`/ingest/` 沿用 ingest 自己的
  额度，`/rpc/`、`/api-reference`、`/mcp` 各 2 MiB，Jira webhook 1 MiB（无会话端点，
  且验签必须先全读进内存），未登记的路径兜底 64 KiB。超限一律 413，响应形状与 ingest 一致。
- **限流的来源地址取 socket 层对端地址，刻意不读 `X-Forwarded-For`**：转发头是客户端能随手
  伪造的一行文本，读它等于每个请求换一个值就把限流绕过去。
- **不能把自己移出项目**。平台 admin 不豁免：这个菜单是「把别人移出项目」的管理入口，
  产品里没有「主动退出项目」这个动作。
- **移除 docker compose 的弱口令兜底**。`:-password` 会让一台忘了填 `.env` 的机器静默跑起一个
  口令为 `password` 的库，而库里躺着 `api_tokens.token_hash` 和 `jira_configs` 的密文。
- **Postgres 宿主机端口只发布在 `127.0.0.1`**。Docker 的端口发布直接改 iptables 的 DOCKER 链，
  绕过宿主机上的 ufw / firewalld——摊在 `0.0.0.0` 上的话，你在防火墙里看不到这个洞。

[未发布]: https://github.com/automationstack/automationstack/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/automationstack/automationstack/releases/tag/v1.0.0
