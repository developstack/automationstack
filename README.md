# automationstack

一个**测试用例管理平台**：用例的编写、评审、组织成测试任务、执行结果回流，都在这里。

它和别的用例管理工具不一样的地方有两条：

1. **用例可以由你自己的本地 agent 生成。** 平台在 `/mcp` 上开了一个无状态的
   Streamable HTTP MCP 端点（鉴权是 `Authorization: Bearer <API Token>`），
   配套两份 skill —— `testcase-authoring`（从需求 / PRD / 接口定义设计新用例）
   和 `testcase-migration`（把 Excel / CSV / XMind / TestRail 的存量导出件搬进来）。
   Claude Code、Codex、opencode、zcode 走 MCP 客户端接入；pi 没有 MCP 客户端，
   只装 skill、靠 skill 里的 curl 直连同一个端点。
   四家客户端的 MCP 配置格式各不相同，所以不要手写——平台上有一条
   `install-agent-skill.sh`，一条命令装完 skill 和配置（脚本自己从不接触 token 值）。
2. **自动化测试的结论能写回用例。** `packages/sdk-*` 下有三份 SDK
   （Node / Python / Java，同一份规范的三份实现），在你现有的测试跑完之后
   一次性把结果批量上报，并打印一张逐条的对账单。测试代码本身不用改一行，
   归属只认用例的 `sourceRef`。可跑的最小工程在 [`examples/`](./examples)。

## 技术栈

- **TypeScript** —— 全仓统一
- **TanStack Start**（React 19 + TanStack Router）—— web，**SSR，不是 SPA**
- **Hono + oRPC** —— server，端到端类型安全，带 OpenAPI
- **Drizzle ORM + PostgreSQL** —— 数据访问一律走 `packages/db` 的 repository
- **pg-boss** —— 后台任务（报告自动提交扫描等）
- **TailwindCSS + shadcn/ui** —— 共享 UI 原语在 `packages/ui`
- **Turborepo + pnpm workspace** —— monorepo
- **Biome / Ultracite** —— 格式化与主要 lint
- **ESLint** —— 只管 Biome 覆盖不到的那几条（函数行数、圈复杂度、
  consistent-return、no-non-null-assertion）

## 先决条件

- Node.js 24（两个 Dockerfile 和 CI 都钉在 `node:24-slim`）
- pnpm 11.17.0（根 `package.json` 的 `packageManager` 字段说了算，
  用 corepack 就不用自己装）
- PostgreSQL 18。用 `docker compose up -d postgres` 起一个即可，
  也可以用本机已有的实例。
- Java 21+ / Python 3.9+ —— 只有要跑 `examples/jdk`、`examples/python` 才需要

## 起本地开发环境

```bash
# 1. 装依赖
pnpm install

# 2. 填三份环境变量。三份都有 .env.example，里面逐条写了每个变量的含义与后果。
cp .env.example .env                        # 只给 docker compose 展开用（POSTGRES_PASSWORD）
cp apps/server/.env.example apps/server/.env # DATABASE_URL / CORS_ORIGIN / SESSION_SECRET 是必需的
cp apps/web/.env.example apps/web/.env       # VITE_SERVER_URL

# 3. 起数据库（这一步会读上面那个根 .env）
docker compose up -d postgres

# 4. 建表
pnpm db:migrate

# 5. 起服务
pnpm dev
```

打开 <http://localhost:3001>。

### 端口

| 端口 | 是谁 |
| --- | --- |
| 3001 | web（TanStack Start / nitro，SSR） |
| 3000 | server（Hono / oRPC / MCP / WebSocket） |
| 5433 | compose 起的 Postgres 在**宿主机**上的端口 |

5433 而不是 5432 是刻意的：开发机上 Homebrew 装的 Postgres 常年占着 5432，
撞上去的典型症状是「你以为连的是容器、其实连的是本机那个库」。
容器之间仍然走 `postgres:5432`，不受影响。
这个端口只发布在 `127.0.0.1` 上，外部机器连不上（要连请走 SSH 隧道）。

### 数据库：用 `db:migrate`，不要用 `db:push`

`packages/db/src/migrations/` 里有 14 份已经进版本库的迁移，它们是表结构的
唯一事实来源。正路是 `pnpm db:migrate`（对应 `drizzle-kit migrate`）。

`pnpm db:push` 是 `drizzle-kit push`，它绕过迁移文件直接把 schema 怼进库里，
之后你的库和迁移历史就对不上了。只在「本地随手试一个字段，试完就 drop」
这种一次性场景里用它。

改了 `packages/db/src/schema/`：先 `pnpm db:generate` 生成迁移文件，
再 `pnpm db:migrate` 应用，两份都要提交。

> ⚠️ CI **不跑迁移**。带迁移的改动合进来之后，每个人都要在本机手动跑一次
> `pnpm db:migrate`，否则依赖新表/新列的接口会整片 500。
>
> ⚠️ `db:push` / `db:generate` / `db:migrate` 在 `turbo.json` 里标了
> `"interactive": true`，非 TTY 环境（脚本里、CI 里）跑不起来。那种场合直接调
> `pnpm --filter @automationstack/db exec drizzle-kit migrate`。

### 种一份演示数据

```bash
pnpm db:seed-automation-demo
```

幂等，重复跑不会造出第二份。它会打印一个演示项目、一批用例、两个未提交的测试任务，
以及一段可以直接抄进 `examples/*/.env` 的配置（**API token 明文只在这一刻出现一次**，
库里只存 SHA-256 哈希，任何接口都取不回明文）。

## 目录结构

```
automationstack/
├── apps/
│   ├── web/            # 前端（React + TanStack Start，SSR，3001）
│   └── server/         # 后端（Hono + oRPC + MCP 端点 + WebSocket，3000）
├── packages/
│   ├── api/            # 业务逻辑与 oRPC 路由（private，不发布）
│   ├── db/             # Drizzle schema、迁移、repository（private，不发布）
│   ├── env/            # 环境变量 schema（@t3-oss/env-core + zod，private）
│   ├── config/         # 共享的 tsconfig / 工具配置（private）
│   ├── ui/             # 共享 shadcn/ui 原语与设计 token（private）
│   ├── sdk-node/       # 上报 SDK：Node —— 发到 GitHub Packages（npm）
│   ├── sdk-python/     # 上报 SDK：Python —— 不发 PyPI，从 git tag 装
│   ├── sdk-pytest/     # 上报 SDK 的 pytest 插件 —— 同上
│   └── sdk-java/       # 上报 SDK：Java —— 发到 GitHub Packages（Maven）
├── examples/           # 三份能真跑起来的最小接入工程，见 examples/README.md
│   ├── nodejs/         #   node:test / vitest / WebdriverIO
│   ├── python/         #   pytest
│   └── jdk/            #   JUnit 5
├── scripts/            # 门禁脚本、种子脚本
├── eslint-rules/       # 仓库自有的 eslint 规则
└── .claude/skills/     # 两份 skill 的真身（发给用户的那份由脚本从这里生成）
```

数据库访问只在 `packages/db` 里发生：`packages/api` 不 import drizzle，
也不直连库，只调 repository。

## UI 定制

web 通过 `packages/ui` 共享 shadcn/ui 原语。

- 设计 token 与全局样式：`packages/ui/src/styles/globals.css`
- 共享原语：`packages/ui/src/components/*`
- shadcn 别名与 style 配置：`packages/ui/components.json` 与 `apps/web/components.json`

在仓库根添加更多共享原语：

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

引用：

```tsx
import { Button } from "@automationstack/ui/components/button";
```

只给 web 用的 block（不打算共享的），在 `apps/web` 目录里跑 shadcn CLI。

## 部署

### Docker Compose

```bash
cp .env.example .env                          # POSTGRES_PASSWORD 必填，没有兜底值
cp apps/server/.env.example apps/server/.env  # 必须存在，compose 里是 required: true
pnpm docker:up                                # = docker compose up -d --build
pnpm docker:logs
pnpm docker:down
```

compose 里有四个服务：`postgres`、一次性的 `migrate`（跑完就退出）、`server`、`web`。
compose 的 `server` 固定以 `NODE_ENV=production` 运行。
生产检查会拒绝公开的开发密钥，并在没有管理员时要求 `ADMIN_INITIAL_PASSWORD`。
迁移由 `migrate` 服务跑——仓库里没有任何别的地方会自动跑迁移，
server 的启动路径、两个 Dockerfile、CI 全都不跑。

### ⚠️ `VITE_SERVER_URL` 是**构建期**变量

浏览器该去哪里找后端，这个值在 `pnpm build` 那一刻就被 Vite 直接内联进了
前端产物。**运行时改环境变量、重启容器都不会生效。**

这条最容易以一种极难定位的形式咬人：镜像里烤着 `http://localhost:3000` 时，
别人 pull 下来部署到自己机器，页面能正常打开，但每一个请求都打向
**访问者浏览器自己的** localhost:3000——服务端日志里一条请求都没有。

换部署地址 = 重新构建镜像，不是重启：

- **docker compose**：改 `docker-compose.yml` 里 web 服务的
  `build.args.VITE_SERVER_URL`，然后 `docker compose build web`。
- **CI / GHCR 镜像**：在仓库 Settings → Secrets and variables → Actions →
  Variables 里设 `VITE_SERVER_URL`（`.github/workflows/ci.yml` 读它；
  没设时兜底的是 `http://localhost:3000`）。它是公开的后端地址不是密钥，
  所以放 Variables 而不是 Secrets。

`CORS_ORIGIN`（server 侧）必须和 `VITE_SERVER_URL`（web 侧）**成对地改**：
前者填错是浏览器报 CORS，后者填错是前端根本请求不到后端——
两种症状完全不同，根因是同一处没对齐。

### 数据库口令

`POSTGRES_PASSWORD` 没有兜底值，没设时 `docker compose` 直接拒绝启动。
这是刻意的：它同时被拼进 `server` 和 `migrate` 的 `DATABASE_URL`，
一个静默生效的弱口令会让整个库（含 `api_tokens.token_hash`、
Casdoor 的 client secret 密文）敞在那里，而没有任何人会注意到。

### 单机生产部署（`make up:prod`）

`make up:prod` 在一台服务器上运行生产构建。数据库在外部机器上，本仓库不启动数据库。
集群上的正式生产环境不使用它。正式生产环境由 `developstack/k8s-gitops` 的 `automationstack/k8s` 管理。

服务器上必须有 docker（含 compose 插件）、git 和 make。

所有配置在一个文件中：仓库根目录的 `.env.prod`。它的模板是 `.env.prod.example`。
`.env.prod` 不进入 git。重新 clone 仓库后它不存在，所以要单独备份它。

#### 入口与跨域

nginx 是唯一的入口，监听 80 和 443。server 和 web 不发布端口。
前端和后端使用同一个域名 `https://<DOMAIN>`。nginx 按路径分流，所以浏览器中没有跨域请求：

| 路径 | 转发到 |
| --- | --- |
| `/rpc`、`/api`、`/ingest`、`/mcp`、`/ws`、`/health` | server |
| 其他路径 | web |

路径与 k8s-gitops 的 `ingress.yaml` 相同。修改 `deploy/nginx/locations.conf` 时，两处一起改。
web 的 `VITE_SERVER_URL` 和 server 的 `CORS_ORIGIN` 都由 `DOMAIN` 得出，所以两者总是相同。

登录限流按客户端 IP 计数。nginx 用连接地址覆盖 `X-Real-IP` 请求头，server 从这个请求头读取客户端 IP（`CLIENT_IP_HEADER`）。
server 不发布端口，所以客户端不能绕过 nginx 伪造这个请求头。

HTTPS 证书来自 Let's Encrypt。`make up:prod` 申请第一张证书。certbot 服务自动续期证书。
证书在 docker 卷 `letsencrypt` 中。`make down:prod` 不删除它。

#### 准备

1. 在阿里云中，把域名的 A 记录指向本服务器的公网 IP。
2. 在阿里云安全组中，允许 80 和 443 端口的入站流量。
3. 中国内地的服务器：确认域名已经完成 ICP 备案。没有备案时，80 和 443 端口被阻断，证书申请失败。
4. 在数据库机器上创建角色和库。角色必须是库的 owner：

   ```sql
   CREATE ROLE automationstack LOGIN PASSWORD '<口令>';
   CREATE DATABASE automationstack OWNER automationstack;
   ```

5. 在 `pg_hba.conf` 中允许本服务器的地址连接这个库。
6. 确认防火墙允许本服务器连接数据库的端口。

#### 第一次启动

1. 执行 `make up:prod`。它从模板生成 `.env.prod`（权限 600），然后停止。
2. 在 `.env.prod` 中填写注释中有 `[必填]` 的键。
3. 再执行一次 `make up:prod`。

#### 每次启动时 `make up:prod` 做的事

1. 合并 `.env.prod`：模板中新增的键，连同注释，追加到 `.env.prod` 的末尾。已有的值不变。
2. 检查 `.env.prod`：必填键为空时，停止。模板中没有的键，给警告。
3. 构建 server 和 web 的镜像。迁移在 server 镜像中执行，所以构建在迁移之前。
4. 预检外部库，然后执行迁移（SQL）。这一步在启动或替换任何服务之前。
   它失败时，`make up:prod` 停止，正在运行的旧服务不变。
5. 启动 server、web、nginx 和 certbot，等到 server 和 web 变为 healthy。
6. 没有证书时，向 Let's Encrypt 申请。然后 nginx 改用 HTTPS。
   申请失败时，站点继续用 HTTP 提供服务。改正原因后，再执行一次 `make up:prod`。

server 第一次启动时，库中没有管理员。这时它用 `ADMIN_INITIAL_PASSWORD` 创建引导管理员。
`ADMIN_INITIAL_PASSWORD` 为空时，server 不启动。

#### 其他命令

| 命令 | 作用 |
| --- | --- |
| `make logs:prod` | 跟踪日志。`APP=nginx` 只看 nginx |
| `make down:prod` | 停止并删除容器。镜像、证书和数据库不变 |
| `make up:prod PROD_ENV=<路径>` | 使用其他路径的生产 env 文件 |

在 `apps/server/.env.example` 中增加键时，也在 `.env.prod.example` 中增加它。
`scripts/prod-env.test.mjs` 检查这两个文件的键。

## 可用脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 起全部应用 |
| `pnpm dev:web` / `pnpm dev:server` | 只起其中一个 |
| `pnpm build` | 构建全部 |
| `pnpm check-types` | 全仓类型检查 |
| `pnpm test` | vitest（五个 project：web / api / server / db / sdk） |
| `pnpm check` / `pnpm fix` | Biome + Ultracite 检查 / 自动修 |
| `pnpm lint` / `pnpm lint:fix` | ESLint（行数、复杂度那几条） |
| `pnpm db:migrate` | 应用迁移（**建表用这个**） |
| `pnpm db:generate` | 从 schema 生成新的迁移文件 |
| `pnpm db:push` | 直接推 schema，绕过迁移历史，只用于一次性试验 |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed-automation-demo` | 种一份幂等的演示数据 |
| `pnpm db:start` / `db:stop` / `db:down` | 只操作 compose 里的 postgres |
| `pnpm docker:build` / `docker:up` / `docker:logs` / `docker:down` | 整套 compose |

## 提交前

`lefthook` 在 pre-commit 上跑格式化、lint 和几条仓库自有的硬规则（只作用于
暂存的文件），pre-push 上跑类型检查。CI 会对全仓再跑一遍同样的检查——
`--no-verify` 绕得过本地那道，绕不过 CI 那道。

## 授权

[Apache License 2.0](./LICENSE)。
