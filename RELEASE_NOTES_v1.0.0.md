# automationstack v1.0.0

automationstack 是一个**测试用例管理平台**：用例的编写、评审、组织成测试任务、执行结果回流，
都在这里。

它和别的用例管理工具不同的地方有两条。一是**用例可以由你自己的本地 agent 生成**——平台在
`/mcp` 上开了一个无状态的 Streamable HTTP MCP 端点，配套 `testcase-authoring`
（从需求 / PRD / 接口定义设计新用例）与 `testcase-migration`（把 Excel / CSV / XMind /
TestRail 的存量导出件搬进来）两份 skill；Claude Code、Codex、opencode、zcode 走 MCP 客户端
接入，pi 没有 MCP 客户端，只装 skill、靠 skill 里的 curl 直连同一个端点。二是**自动化测试的
结论能写回用例**——四个零依赖的上报包在你现有的测试跑完之后一次性批量上报，并打印一张逐条
的对账单，测试代码本身不用改一行。

这是首个正式版本。逐条变更见 [CHANGELOG.md](./CHANGELOG.md)。

## 核心能力

- **用例管理** —— 模块树、用例列表与抽屉、版本历史、批量导入（单批 50 条）、附件上传
  （预签名直传，需配置 R2 / S3 兼容存储）。被测试任务引用的用例不删除，改「废弃」状态。
- **脑图画布** —— 模块与用例的新建、改名、移动、删除直接在画布上做，成批提交
  （单批 100 个操作），服务端全有或全无地应用。
- **测试任务与执行台** —— 用例级结论，以及逐步骤判定：步骤上有 P/F/B/S 快捷键、跨刷新保留的
  本机草稿（用例版本变了即作废）、分步汇总条，分步结果自动推导出用例级结论。
- **测试报告** —— 通过率与结论分布、失败清单，以及自动化视图（自动化条数、刷新条数、
  跳过条数、每条失败的执行来源）。
- **项目概览** —— 总数与状态环图、优先级分布、模块通过/失败竖柱图、覆盖缺口。
- **权限与协作** —— 会话认证 + 平台用户管理 + 项目成员与项目级授权（MCP、WebSocket、
  ingest 三条旁路同样受管）；`/ws` 上的实时在线成员与用例编辑占用提示。
- **本地 agent 接入** —— `/mcp` MCP 端点（`Authorization: Bearer <API Token>`），
  两份 skill，以及一条 `install-agent-skill.sh` 把 skill 和五种客户端各不相同的配置一次装完
  （脚本自己从不接触 token 值）。
- **自动化结果回流** —— `/ingest` 端点 + Node / Python / pytest / Java 四个上报包，
  归属只认用例的 `sourceRef`。三份能真跑起来的最小工程在 [`examples/`](./examples)。
- **Jira 集成** —— 缺陷创建与关联、项目级配置、webhook 回写。

## 快速开始

先决条件：Node.js 24、pnpm 11.17.0（用 corepack）、PostgreSQL 18、Docker。

```bash
# 1. 装依赖
pnpm install

# 2. 填三份环境变量，三份都有 .env.example
cp .env.example .env                         # POSTGRES_PASSWORD，必填，没有兜底值
cp apps/server/.env.example apps/server/.env # DATABASE_URL / CORS_ORIGIN / SESSION_SECRET
cp apps/web/.env.example apps/web/.env       # VITE_SERVER_URL

# 3. 起数据库（读上一步那个根 .env）
docker compose up -d postgres

# 4. 建表
pnpm db:migrate

# 5. 起服务
pnpm dev
```

打开 <http://localhost:3001>。

| 端口 | 是谁 |
| --- | --- |
| 3001 | web（TanStack Start / nitro，SSR，不是 SPA） |
| 3000 | server（Hono / oRPC / MCP / WebSocket） |
| 5433 | compose 起的 Postgres 在**宿主机**上的端口（只发布在 `127.0.0.1`） |

宿主机上用 5433 而不是 5432 是刻意的：开发机上 Homebrew 装的 Postgres 常年占着 5432，
撞上去的典型症状是「你以为连的是容器、其实连的是本机那个库」。容器之间仍走 `postgres:5432`。

想直接看到一份可用的数据，跑 `pnpm db:seed-automation-demo`（幂等）。它会打印一个演示项目、
一批用例、两个未提交的测试任务，以及一段可以抄进 `examples/*/.env` 的配置——**API token 明文
只在这一刻出现一次**，库里只存 SHA-256，任何接口都取不回明文。

整套 compose 部署是 `pnpm docker:up`（= `docker compose up -d --build`），四个服务：
`postgres`、一次性的 `migrate`、`server`、`web`。

## 版本对照

发布出去的四个上报包，本次统一到 `1.0.0`：

| 包 | 目录 | 版本 | 怎么拿 |
| --- | --- | --- | --- |
| `@automationstack/sdk` | `packages/sdk-node` | 1.0.0 | GitHub Packages（npm） |
| `automationstack-sdk` | `packages/sdk-python` | 1.0.0 | 不发 PyPI，从 git tag 装（如 `sdk-python-v1.0.0`） |
| `pytest-automationstack` | `packages/sdk-pytest` | 1.0.0 | 同上 |
| `org.automationstack:sdk` | `packages/sdk-java` | 1.0.0 | GitHub Packages（Maven），需要 Java 21+ |

`examples/jdk` 这份示例工程也一并提到 `1.0.0`，它依赖上表最后一行。

应用与内部包（`apps/web`、`apps/server`、`packages/api`、`packages/db`、`packages/env`、
`packages/config`、`packages/ui`）一律 `private`，不发布，也不带版本号——平台本身的版本就是
这份发布说明上的 `v1.0.0`。

授权：整仓 [Apache License 2.0](./LICENSE)。

## 升级 / 部署注意事项

### 1. `POSTGRES_PASSWORD` 没有兜底值了（破坏性变更）

`docker-compose.yml` 里原来写的是 `${POSTGRES_PASSWORD:-password}`，现在改成了
`${POSTGRES_PASSWORD:?...}`：**没设这个变量时 compose 直接拒绝启动**，报错里带一句
「未设置。请先 cp .env.example .env 并填一个真实口令」。

这是刻意的。原来那个兜底看着只是「本地方便」，实际后果是一台忘了填 `.env` 的机器会**静默地**
跑起一个口令为 `password` 的库，而库里躺着 `api_tokens.token_hash` 和 `jira_configs` 的密文。
缺配置要么响亮地失败，要么就成了一个没人知道自己开着的弱口令库。

同一个变量被拼进 `server`、`migrate`、`postgres` 三处，靠同一次 `${POSTGRES_PASSWORD}` 展开，
所以只在仓库根的 `.env` 填一次就够，别去改 compose 里的字面量。

同批还有两处收紧：`apps/server/.env` 由 `required: false` 改成 `required: true`
（文件缺失时在拉起容器之前就失败，而不是等 healthcheck 转 unhealthy 再去翻日志）；
Postgres 的宿主机端口由 `5433:5432` 收窄为 `127.0.0.1:5433:5432`。

### 2. `VITE_SERVER_URL` 是构建期变量，不是运行期变量

浏览器该去哪里找后端，这个值在 `pnpm build` 那一刻就被 Vite 直接内联进了前端产物
（`apps/web/Dockerfile` 里它是 `ARG` / `ENV`，只在构建阶段生效）。**运行时改环境变量、
重启容器都不会生效。**

这条会以一种极难定位的形式咬人：镜像里烤着兜底的 `http://localhost:3000` 时，别人 pull 下来
部署到自己机器，页面能正常打开，但每一个请求都打向**访问者浏览器自己的** localhost:3000——
服务端日志里一条请求都没有。

所以**发布镜像之前**必须先设好它：

- **CI / GHCR 镜像**：仓库 Settings → Secrets and variables → Actions → **Variables** 里设
  `VITE_SERVER_URL`（`.github/workflows/ci.yml` 读它，没设时兜底 `http://localhost:3000`）。
  它是公开的后端地址不是密钥，所以放 Variables 而不是 Secrets。
- **本地 compose**：改 `docker-compose.yml` 里 web 服务的 `build.args.VITE_SERVER_URL`，
  然后 `docker compose build web`。

换部署地址 = 重新构建镜像，不是重启。另外 `CORS_ORIGIN`（server 侧）必须和 `VITE_SERVER_URL`
（web 侧）**成对地改**：前者填错是浏览器报 CORS，后者填错是前端根本请求不到后端——症状完全
不同，根因是同一处没对齐。

### 3. 迁移只能手动跑，且 0013 会删表

`packages/db/src/migrations/` 里有 14 份迁移，是表结构的唯一事实来源。用 `pnpm db:migrate`
（`drizzle-kit migrate`），不要用 `db:push`。compose 部署由一次性的 `migrate` 服务跑迁移，
除此之外仓库里没有任何地方会自动跑——**CI 不跑迁移**，本地拉到带迁移的改动后必须自己跑一次，
否则依赖新表/新列的接口会整片 500。

`db:push` / `db:generate` / `db:migrate` 在 `turbo.json` 里标了 `"interactive": true`，
非 TTY 环境（脚本里、CI 里）跑不起来，那种场合直接调
`pnpm --filter @automationstack/db exec drizzle-kit migrate`。

⚠️ 迁移 `0013` 会 `DROP TABLE` 掉 `ai_case_proposals`、`ai_generation_sessions`、
`ai_provider_config` 三张表和两个枚举——这是「用例生成改由本地 agent 完成」那次改动的一部分。
如果你的库里存过平台内置 AI 供应商配置或未落盘的生成会话，跑完这份迁移它们就没了，
没有回滚路径。

### 4. `SESSION_SECRET` 与其它必填项

`apps/server/.env` 里 `DATABASE_URL`、`CORS_ORIGIN`、`SESSION_SECRET` 是必需的，缺了 server
起不来。`SESSION_SECRET` 至少 32 字符（`openssl rand -base64 32`）。附件功能依赖一组
`R2_*` 变量，不配也能跑，只是上传能力不可用（界面上有提示）。

## 已知限制

如实写在这里，别在部署时才撞上。

- **登录限流是单实例的内存计数，多副本部署下失效。** 计数只活在本进程里：起 N 个实例，
  攻击者的尝试被负载均衡摊开、每个进程各算各的，等效阈值直接变成 N 倍；进程重启则清零。
  当前设计的部署形态是**单个 server 容器**。真要多实例，得把 IP 窗口与失败计数搬到 Redis
  之类的共享存储上（并发位仍按进程算，它护的本来就是本进程的线程池）——不是改一下 replicas
  就还成立。
- **限流的 IP 维度对分布式来源无效。** 单 IP 滑动窗口挡的是「一台机器猛敲」；换一批源地址就
  绕过去了。这一档由与地址无关的**全局并发位**兜底（同时最多 2 路 PBKDF2 在跑），它保证不管
  攻击者手上有多少源地址，登录占用的线程都不会超过 2。另外，取不到 socket 地址时 IP 这一维
  整个跳过，只剩并发位。
- **来源地址不读 `X-Forwarded-For`。** 当前 compose 里 server 前面没有反向代理，socket 地址
  就是真地址。日后真在前面放了反代，必须改 `apps/server/src/index.ts` 里的 `readClientIp` 并
  同时定下「信任几跳」，否则所有请求会被算成反代那一个地址，按 IP 那道闸等于全站共用一个桶。
- **全局并发位把登录吞吐按在约 26 次/秒**（2 / 75ms）。内部测试平台的真实峰值离它两三个数量级，
  超出时给的是明确的 429 而不是排队等超时；但如果你的场景是几百人同一秒登录，这个数要重新算。
- **请求体上限是一张闭世界白名单。** 未登记的路径兜底 64 KiB，所以新增一条会收大体的路由却忘了
  在 `request-body-limit.ts` 里登记，症状是它稳定地回 413。这个方向的失败是刻意选的
  （总好过悄悄地不设防），但确实是一处需要记得维护的地方。
- **会话 7 天且没有滑动续期。** 每个长期使用的人早晚会撞上一次到期，这一版的行为是自动跳登录页
  并带上回跳地址，不是无感续期。
- **脑图批量是全有或全无。** 任何一个操作被服务端拒绝，整批回滚、画布恢复为服务端数据——用户刚做
  的一整批改名 / 移动 / 新建都不会留下。这条链路是乐观 UI，没有能把画布单独回滚回去的逆操作。
  另外批量路径丢掉了结构化数据，提示里说得出「是什么性质的拒绝」，但说不出「被几个测试任务引用」
  这种数字（单条删除路径能）。
- **Python 侧的两个包不发 PyPI**，只能从 git tag 装；Node 与 Java 走 GitHub Packages，
  需要带 `GITHUB_TOKEN` 认证才拉得到。三处都不是公共镜像源。
