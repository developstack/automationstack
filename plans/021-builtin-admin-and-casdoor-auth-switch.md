# 021 — 内置管理员账号 + 可配置切换到 Casdoor 认证

> 基线 commit：`7b9d122`（main）。
> 用户要求：(1) 系统必须有内置的 admin 账号和密码，上线后不依赖手工执行 `seed-admin`。(2) 做一套配置，可以把认证和权限切换给 Casdoor 管理。
> 参考：`docs/casdoor-migration-evaluation-2026-09.md`（下文简称「评估文档」）。本方案沿用它的混合式结论，但把单向迁移改为**可配置切换的双模式**。
> 状态：用户决策已确认（§2）。§8 的 Casdoor 部署信息补齐后，阶段 3 才能开工。阶段 1 和阶段 2 可以开工。

## 0. 背景与现状

### 0.1 现有问题

- 系统没有内置管理员。服务启动时不创建账号。`.env` 中没有管理员配置。
- 第一个管理员只能用 `scripts/seed-admin.ts` 创建。生产镜像里没有 pnpm，所以 `make db-seed-admin` 不能在 pod 中使用。
- 不传密码时，脚本只打印一次随机密码。密码丢失后无法恢复：没有命令行重置功能，也没有用户自助修改密码的功能。

### 0.2 现有认证结构（本方案的改动点）

| 部分 | 位置 | 说明 |
| --- | --- | --- |
| 登录 | `packages/api/src/routers/auth.ts:27-55` | 直接调用 `getUserByUsername` + `verifyPassword`。没有认证提供方的抽象。 |
| 会话 | `packages/api/src/auth/session.ts:77,107` | HMAC 签名的无状态 cookie，有效期 7 天。没有会话表。 |
| 每次请求的身份解析 | `packages/api/src/context.ts:33-49` | 每次请求查 `users` 表，检查 `disabledAt`。角色和禁用状态的改动立即生效。 |
| Bearer token | `packages/api/src/auth/bearer.ts:11-30` | 供 `/mcp` 和 `/ingest/*` 使用。token 解析后得到 `users` 行。 |
| WebSocket | `apps/server/src/realtime/handshake.ts:31-58` | 使用 `resolveUserFromCookies`。 |
| 权限 | `packages/api/src/index.ts:11-44`、`lib/project-access.ts` | 平台角色（admin / member）× 项目角色（owner / member）。 |
| 用户表 | `packages/db/src/schema/users.ts:7-20` | `password_hash` 为 NOT NULL。没有外部身份字段。 |
| 环境变量 | `packages/env/src/server.ts:32-71` | t3-env + zod。`isR2Configured()` 是「可选功能」的现有写法。 |
| 服务启动 | `apps/server/src/index.ts:131-145` | `startRealtime()` → `startJobs()` → `serve()`。服务启动时不执行迁移。 |

`users.id` 被 10 张表的 13 个外键引用（评估文档 §0）。所以任何模式下都必须保留本地 `users` 行。

## 1. 决策记录

- **D1 认证模式由一个环境变量决定**：`AUTH_PROVIDER=local | casdoor`，默认值为 `local`。
  - **已被 §10 修订**：认证方式和 Casdoor 连接参数改为在页面中配置，保存在数据库中，保存后立即生效。环境变量只提供默认值。以下两行是原决定，保留作记录。
  - 切换模式必须重启服务。不做运行时热切换。
  - 前端不使用构建期变量判断模式。服务端新增公开接口 `auth.config`，返回当前模式和登录入口。同一个镜像可以用于两种模式。
- **D2 内置管理员在服务启动时自动创建**（「引导管理员」）：
  - 条件：本地密码登录处于启用状态，并且数据库中没有「可以用本地密码登录的有效管理员」。有效管理员指 `role = admin`、`disabled_at IS NULL`、`password_hash IS NOT NULL`。
  - 用户名取 `ADMIN_USERNAME`，默认值为 `admin`。密码取 `ADMIN_INITIAL_PASSWORD`。
  - 只在上述条件成立时创建。已有管理员时，服务不读取这个密码，也不覆盖任何密码。
  - 生产环境（`NODE_ENV=production`）中，需要创建引导管理员但没有配置 `ADMIN_INITIAL_PASSWORD` 时，服务必须拒绝启动，并在日志中写明原因。
  - 生产环境中，`ADMIN_INITIAL_PASSWORD` 等于 `.env.example` 中的开发默认值时，服务也必须拒绝启动。
  - 生产环境中，引导管理员第一次登录后必须修改密码。本地开发环境不强制。
  - 多个副本同时启动时，`createUser` 的 `onConflictDoNothing` 防止重复创建。
  - **不把固定密码写在代码中。** 原因：所有部署都会共用这个密码，等于公开密码。
- **D3 增加两个找回途径**：
  - 用户自助修改密码：新增 `auth.changePassword`。
  - 运维命令：新增 `scripts/reset-password.ts`。它可以在 pod 中用 `tsx` 执行，用来恢复丢失的管理员密码。
- **D4 Casdoor 模式采用评估文档的混合式结构**：
  - Casdoor 负责身份：登录页、密码、MFA、LDAP / 企业微信等第三方登录、账号的禁用状态。
  - **平台角色（admin / member）的来源改为 Casdoor**，通过配置的角色名映射（`CASDOOR_ADMIN_ROLE`）。登录时、webhook 事件到达时和定期对账时，同步到本地 `users.role`。
  - **同步必须覆盖，不能只增加**：`role = roles 中有 CASDOOR_ADMIN_ROLE ? admin : member`。`roles` 缺失或为空时，结果是 `member`。（aidevstack `353b16e` 修复了「Casdoor 移除角色后本地仍是管理员」的问题。）
  - 只接受所属组织等于 `CASDOOR_ORGANIZATION` 的角色。角色名使用本系统专用的名字，例如 `automationstack-admin`，不与 aidevstack 的 `platform-admin` 共用。
  - `auth_source = local` 的用户不参与同步，所以应急管理员不受 Casdoor 影响。
  - **项目级权限（project owner / member）保留在本地。** 原因见评估文档 §3.3：`requireProjectMember` 是高频路径，改为远程调用会改变延迟和故障模式。
  - API token、MCP、ingest、WebSocket 不改。它们都通过本地 `users` 行解析身份。
- **D5 会话机制不变**（评估文档的「方案 I」）：OIDC 回调完成后，服务端调用现有的 `createSessionToken` 签发 cookie。`session.ts`、`context.ts` 和前端的会话处理代码不改。
- **D6 本地 `users` 表作为影子表**：
  - 新增 `auth_source`（`local | casdoor`）、`external_id`（Casdoor 用户 id，可空，唯一）、`must_change_password`（布尔）。
  - `password_hash` 改为可空。Casdoor 用户没有本地密码。
  - Casdoor 用户第一次登录时：按 `external_id` 匹配。没有匹配时，创建新行。不按用户名关联已有的本地账号。
  - 新行的用户名与已有本地用户名冲突时，登录失败，并在日志中写明冲突。管理员必须先处理冲突（例如修改本地用户名）。
  - Casdoor 中删除用户时，本地只设置 `disabled_at`，**不删除行**。删除行会级联删除项目成员和 API token。
- **D7 应急登录**：`AUTH_PROVIDER=casdoor` 时，默认保留本地管理员登录（`AUTH_ALLOW_LOCAL_LOGIN` 默认为 `true`）。
  - 只有 `auth_source = local` 并且 `role = admin` 的账号可以用本地密码登录。本地普通用户不能用本地密码登录。
  - 引导管理员（D2）在这个模式下也会创建。
  - Casdoor 不可用时，管理员用本地账号登录。
  - 设为 `false` 时，本地密码登录完全关闭。
- **D8 OIDC 客户端使用 `openid-client` 依赖**：Casdoor 支持标准 OIDC 发现地址 `/.well-known/openid-configuration`。不使用 Casdoor 专用 SDK，以便以后接入其他 OIDC 提供方。这是一个新依赖，需要用户批准。
- **D9 Webhook 校验**：Casdoor 的 webhook 没有签名（评估文档 §5）。新增 `CASDOOR_WEBHOOK_SECRET`，Casdoor 在自定义请求头中发送它，服务端用常量时间比较。
- **D10 本地开发和 CI 默认使用 `local` 模式**：`docker-compose.yml` 新增一个可选的 `casdoor` profile，只在调试 Casdoor 模式时启动。CI 不启动 Casdoor。
- **D11 Casdoor 的公网地址和集群内地址分开使用**（与 aidevstack 相同）：
  - 浏览器跳转使用公网地址 `CASDOOR_ISSUER`。
  - 服务端读取发现文档、JWKS 和换取 token 时，使用集群内地址 `CASDOOR_INTERNAL_URL`。原因：公网地址前面有 Cloudflare Access，服务端请求会得到 HTML 登录页，不是 JSON。
  - 服务端从集群内地址读取发现文档后，必须改写其中的地址：`token_endpoint` 和 `jwks_uri` 改为集群内地址，`authorization_endpoint` 改为 `CASDOOR_ISSUER` 的地址。原因：Casdoor 的 `origin` 没有固定时，发现文档中的地址来自请求的 Host 头（aidevstack `oidc_internal.go` 的做法）。
  - ID token 的 `iss` 必须等于 `CASDOOR_ISSUER`。
  - `CASDOOR_ISSUER` 和 `CASDOOR_INTERNAL_URL` 只接受不带路径的地址（协议 + 主机 + 端口）。
  - Casdoor 管理 API（D13）也使用集群内地址。
  - T9 必须确认 `openid-client` 允许「从集群内地址读取发现文档，但 `iss` 是公网地址」。aidevstack 的 Go 库需要专门的选项才能这样做。不允许时，手工构造 OIDC 配置，但仍然校验 `iss`。
- **D12 所有 Casdoor 路由放在 `/api/auth/casdoor/` 下**：生产 Ingress 只把 `/api` 等前缀转发给 server，其他路径转发给 web。放在 `/api` 下不需要修改 Ingress。
- **D13 定期对账作为 webhook 的补充**：
  - webhook 可能丢失。被禁用的用户的 API token 会继续有效（§7）。
  - 新增定期任务（使用现有的 pg-boss）：用 `client_credentials` 取得管理 token，分页读取组织中的全部用户和角色，同步 `role` 和 `disabled_at`。Casdoor 中已删除的用户，本地设置 `disabled_at`。
  - 管理 API 的凭据必须放在 HTTP Basic 头中，不能放在 URL 中。放在 URL 中会写入代理和 Casdoor 的访问日志（aidevstack `cffad68`）。
  - 错误信息中不得包含 client secret。
  - Casdoor 应用必须开启 `client_credentials` 授权类型（T17）。
- **D14 已知的开发密钥在生产环境中一律拒绝**：
  - `.env.example` 和 `docker-compose.yml` 中所有密钥类的值放入同一个列表。
  - `NODE_ENV=production` 时，任何密钥变量等于列表中的值（去掉首尾空格，不区分大小写），服务拒绝启动。错误信息只写变量名，不写值。
  - 原因：`SESSION_SECRET` 的开发默认值是公开的。生产环境使用它时，任何人都可以伪造管理员的登录 cookie。aidevstack `353b16e` 修复了同类问题。
  - 一个测试检查：`.env.example` 中的每个密钥都在列表中。
- **D15 应急操作必须留下记录**：
  - Casdoor 模式下，每次本地密码登录都写 WARN 日志和审计记录，包含用户名。
  - 每次运行 `reset-password.ts` 和每次创建引导管理员，都写 WARN 日志。
  - 日志中不得包含密码。

## 2. 用户决策（2026-10-08 已确认）

1. **内置密码**：来自环境变量 `ADMIN_INITIAL_PASSWORD`。生产环境必须配置。代码中没有固定默认密码。（D2）
2. **权限来源**：平台角色（admin / member）由 Casdoor 管理。项目级权限保留在本地。（D4）
3. **应急登录**：Casdoor 模式下保留本地管理员登录，由 `AUTH_ALLOW_LOCAL_LOGIN` 控制。（D7）
4. **按用户名关联已有账号**：关闭。删除 `CASDOOR_LINK_BY_USERNAME` 配置项。Casdoor 用户第一次登录时，只按 `external_id` 匹配，没有匹配就创建新行。（D6）
5. **Casdoor 的部署**：参照 `k8s-gitops` 仓库的现有部署。详见 §8。
6. **退出登录**：只清除本系统的 cookie，不退出 Casdoor。
7. **新依赖 `openid-client`**：同意。（D8）
9. **Casdoor 组织**（2026-10-09）：新建 `automationstack` 组织，与 aidevstack 的账号隔离。不使用 `built-in`。（§8）
10. **重置密码后的 API token**（2026-10-09）：用户改完密码之前，他的 API token（MCP 调用）也被拦截。保持阶段 1 的实现。
11. **T9 技术验证**（2026-10-09）：同意在本地用 docker 运行 Casdoor 4.11.0 完成验证。
8. **认证设置页面**（2026-10-08 追加）：管理员在前端页面中切换认证方式和配置 Casdoor。**页面配置优先于环境变量**。实现参照 aidevstack 的做法。（修订 D1，见 §10）

## 3. 配置项

> **§10 修订了本节**：Casdoor 的连接参数和认证方式可以在页面中修改，页面中的值优先。本节的环境变量只在数据库中没有保存过配置时使用。哪些变量只能在环境变量中设置，见 §10.2。

全部加入 `packages/env/src/server.ts`，并在 `apps/server/.env.example` 中写明用途。

| 变量 | 模式 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `AUTH_PROVIDER` | 全部 | `local` | `local` 或 `casdoor`。 |
| `ADMIN_USERNAME` | 本地登录启用时 | `admin` | 引导管理员的用户名。 |
| `ADMIN_INITIAL_PASSWORD` | 本地登录启用时 | 无 | 引导管理员的初始密码，至少 8 位。生产环境需要创建引导管理员时必须配置。 |
| `AUTH_ALLOW_LOCAL_LOGIN` | `casdoor` | `true` | 在 Casdoor 模式下保留本地管理员的应急登录（D7）。 |
| `CASDOOR_ISSUER` | `casdoor` | 无 | Casdoor 的公网地址，用作 ID token 的 `iss` 期望值，也用于浏览器跳转。必须与 Casdoor 的 `origin` 配置逐字相同。 |
| `CASDOOR_INTERNAL_URL` | `casdoor` | 无 | Casdoor 的集群内地址。服务端用它读取发现文档和 JWKS，并换取 token（D11）。 |
| `CASDOOR_ORGANIZATION` | `casdoor` | 无 | Casdoor 组织名。只接受这个组织的用户。 |
| `CASDOOR_CLIENT_ID` | `casdoor` | 无 | Casdoor 应用的 client id。 |
| `CASDOOR_CLIENT_SECRET` | `casdoor` | 无 | Casdoor 应用的 client secret。 |
| `CASDOOR_REDIRECT_URL` | `casdoor` | 无 | OIDC 回调地址，指向 `/api/auth/casdoor/callback`。必须与 Casdoor 应用中的配置逐字相同。 |
| `CASDOOR_ADMIN_ROLE` | `casdoor` | 无 | Casdoor 中的角色名。拥有这个角色的用户映射为平台 admin。 |
| `CASDOOR_WEBHOOK_SECRET` | `casdoor` | 无 | webhook 共享密钥，至少 32 位。 |

变量名与 aidevstack 的现有配置一致（`CASDOOR_ISSUER`、`CASDOOR_INTERNAL_URL`、`CASDOOR_REDIRECT_URL`、`CASDOOR_ORGANIZATION`），以便运维人员使用同一套检查清单。

登录完成后，服务端跳转到 `CORS_ORIGIN`（前端地址）。不新增前端地址的变量。

校验规则：`AUTH_PROVIDER=casdoor` 时，上表中模式为 `casdoor` 且没有默认值的变量必须有值。缺少任何一个，服务必须拒绝启动。

## 4. 任务拆分（按阶段串行）

### 阶段 1：内置管理员和密码找回（不依赖 Casdoor，可以单独上线）

#### T1 `packages/db`：用户表结构

- 文件：`src/schema/users.ts`，新迁移文件。
- 新增 `auth_source`（枚举 `local | casdoor`，默认 `local`）、`external_id`（text，可空，唯一）、`must_change_password`（boolean，默认 `false`）。
- `password_hash` 改为可空。
- 仓库层新增：`countLocalLoginAdmins()`、`setMustChangePassword()`、`getUserByExternalId()`。
- `toPublicUser` 增加 `authSource` 和 `mustChangePassword`。

#### T2 `packages/env`：认证配置

- 文件：`src/server.ts`、`apps/server/.env.example`。
- 加入 §3 的全部变量和条件校验。
- 新增 `isLocalLoginEnabled()`：`AUTH_PROVIDER=local`，或 `AUTH_ALLOW_LOCAL_LOGIN=true`。
- `.env.example` 写入开发用的 `ADMIN_INITIAL_PASSWORD`，并注明「仅限开发」。

#### T3 `apps/server`：启动时创建引导管理员

- 文件：新建 `src/auth/bootstrap-admin.ts`；修改 `src/index.ts`。
- 在 `serve()` 之前用 `await` 执行。失败时进程以非零码退出。
- 按 D2 的规则执行。日志只写「已创建引导管理员 <用户名>」，不写密码。
- 用户名已被一个不能本地登录的账号占用时（例如 Casdoor 用户），拒绝启动并写明原因。

#### T4 `packages/api`：修改密码和强制修改

- 文件：`src/routers/auth.ts`、`src/index.ts`。
- 新增 `auth.changePassword`：输入旧密码和新密码，长度 8～128。成功后清除 `must_change_password`。
- `must_change_password = true` 时，`requireUser` 只允许 `auth.me`、`auth.logout` 和 `auth.changePassword`。其他接口返回专用错误码。
- `users.resetPassword`（管理员重置）把 `must_change_password` 设为 `true`。

#### T5 `apps/web`：修改密码页面

- 新增修改密码页面，在用户菜单中加入入口。
- `me.mustChangePassword = true` 时，根路由跳转到修改密码页面。

#### T6 `scripts`：运维重置命令

- 新建 `scripts/reset-password.ts`。
- 用法：`tsx scripts/reset-password.ts <用户名>`。从环境变量 `NEW_PASSWORD` 读取新密码。没有这个变量时，生成随机密码并打印一次。
- 不从命令参数读取密码，防止密码出现在 shell 历史和进程列表中。
- 执行后设置 `must_change_password = true`。账号处于禁用状态时，同时解除禁用。
- `seed-admin.ts` 保留，用于额外创建管理员。

### 阶段 2：认证提供方抽象（只有 local 实现，行为不变）

#### T7 `packages/api`：提供方接口

- 新建 `src/auth/providers/`：定义提供方接口（登录入口、回调处理、能否本地改密码、账号管理权限）。
- 把现有登录逻辑移到 `local` 实现中。限流和防用户名枚举的逻辑不变。
- 新增公开接口 `auth.config`：返回 `{ provider, localLoginEnabled, loginUrl }`。

#### T8 `apps/web`：登录页按配置显示

- 文件：`src/components/auth/login-form.tsx`、`src/routes/login.tsx`。
- 根据 `auth.config` 显示用户名密码表单、「使用 Casdoor 登录」按钮，或两者都显示。

### 阶段 3：Casdoor 提供方

#### T9 技术验证（先做，结果写回本文档）

- 在本地启动 Casdoor，确认 ID token 或 userinfo 中有哪些字段：用户 id、用户名、角色、禁用状态。
- 确认 ID token 的 `sub` 等于 Casdoor 用户的 `id`（UUID），不是 `组织/用户名`。
- 确认应用的 Token 格式设为 `JWT` 时，ID token 中有 `roles`，并记录角色对象的格式（是否带所属组织）。`JWT-Empty` 和 `JWT-Standard` 格式没有角色。
- 确认 webhook 的事件名和请求体格式，特别是角色变更事件。记录完整的请求体样例。
- 确认管理 API 的调用方式：`client_credentials` 取 token（凭据放在 Basic 头）、按 id 读取用户、分页读取用户和角色。
- 确认 `openid-client` 能否按 D11 工作。
- 结果决定 T10、T11 和 T11a 的字段映射。不能确认的字段，必须停下来报告，不得猜测。

#### T10 `apps/server` + `packages/api`：OIDC 登录

- 新增 `GET /api/auth/casdoor/login`：生成 state 和 PKCE，跳转到 Casdoor。
- 新增 `GET /api/auth/casdoor/callback`：校验 state，换取 token，校验签名。按 D11 使用集群内地址。
- 使用 nonce，并在回调中校验。（aidevstack 缺少 nonce，是已知缺陷。）
- `sub` 为空时，登录失败。
- 校验 ID token 中的所属组织（`owner`）等于 `CASDOOR_ORGANIZATION`。不只依赖「应用属于这个组织」。
- 按 D6 匹配或创建本地用户。按 D4 覆盖同步角色。然后调用 `createSessionToken` 签发 cookie。
- 用户名只是显示属性，身份以 `external_id` 为准。用户在 Casdoor 中改名后，新用户名与另一个本地用户冲突时，保留原用户名，并写 WARN 日志。
- 本地 `disabled_at` 有值的用户必须登录失败。Casdoor 登录成功不会清除本地的 `disabled_at`，只有 webhook 和对账可以清除它。

#### T11 `apps/server`：webhook 同步

- 新增 `POST /api/auth/casdoor/webhook`：用 `CASDOOR_WEBHOOK_SECRET` 校验请求头。
- Casdoor 通过集群内地址调用 webhook：`http://automationstack-server.automationstack.svc.cluster.local/api/auth/casdoor/webhook`。
- 处理用户更新、禁用和删除事件，同步 `role` 和 `disabled_at`。删除事件只设置 `disabled_at`。
- 这一步必须做。原因：禁用的用户可能不再登录，但他的 API token 仍然有效。
- **角色变更事件中，用户以 `组织/用户名` 表示，不是 id。** 收到角色事件后，服务端通过管理 API 重新读取这个角色的成员，再按 id 更新本地用户。（aidevstack `4404d09` 修复了同类问题。）
  - 其他组织的成员和通配符（例如 `组织/*`）一律丢弃，并写 WARN 日志。原则：只少授权，不多授权。
  - 不得用本地的 `username` 列匹配用户。本地用户名可能已经过时。

#### T11a `apps/server`：定期对账（D13）

- 新增 pg-boss 定期任务，默认每 10 分钟运行一次。
- 分页读取组织中的全部用户（检查 `isForbidden` 和已删除的用户）和 `CASDOOR_ADMIN_ROLE` 的成员，按 D4 和 D6 同步本地的 `role` 和 `disabled_at`。
- 读取失败时只写日志，不修改本地数据。
- 管理 API 的凭据放在 HTTP Basic 头中。错误信息中不得包含 client secret。

#### T12 `packages/api` + `apps/web`：用户管理页面的限制

- Casdoor 模式下，`auth_source = casdoor` 的用户不能在本系统中修改密码、角色和禁用状态。界面显示「请在 Casdoor 中管理」。
- 本系统中创建用户的功能在 Casdoor 模式下关闭。
- 项目成员管理不变。
- 「不能降级最后一个管理员」的检查只对本地用户生效。
- 以上限制必须在 API 层实现，不能只在界面上隐藏。必须有测试证明：没有任何接口可以修改 Casdoor 用户的角色和禁用状态。（aidevstack 发现过通过可写的 `roles` 字段提升自己权限的问题。）

#### T13 `/health` 增加 Casdoor 状态

- Casdoor 模式下，`/health` 报告 Casdoor 发现地址是否可以访问。Casdoor 不可用时只报告，不让服务失败。
- 新增管理员可用的「测试连接」接口，分步报告结果（参照 aidevstack `c6bde60`）：
  1. 通过集群内地址读取发现文档和 JWKS。
  2. 用 `client_credentials` 取得管理 token。
  3. 读取 `CASDOOR_ORGANIZATION` 组织。
- 总时限 12 秒。结果中不得包含 client secret。

### 阶段 4：部署和文档

#### T14 `docker-compose.yml`：可选的 Casdoor profile

- 新增 `casdoor` 服务，只在 `--profile casdoor` 时启动，使用独立数据库。
- 不修改默认的 `make up` 流程。

#### T15 文档

- README 的部署章节：写明引导管理员、`ADMIN_INITIAL_PASSWORD`、重置命令，以及切换到 Casdoor 的步骤。
- 写明 k8s 中执行重置命令的方法：`kubectl exec -it deploy/<server> -- /app/apps/server/node_modules/.bin/tsx /app/scripts/reset-password.ts <用户名>`。
- 写明从 Casdoor 切回 local 模式的后果：Casdoor 用户没有本地密码，管理员必须为他们重置密码。

#### T16 `k8s-gitops` 仓库：部署配置（另一个仓库，推送前必须由用户批准）

推送到 `k8s-gitops` 的 main 分支后，ArgoCD 会自动部署。所以每次推送前，必须由用户批准。

- 阶段 1 上线时：
  - 在 `automationstack-secrets` 中加入 `ADMIN_INITIAL_PASSWORD`。用 `scripts/seal.sh` 重新封装整个 Secret，`SECRET_ENCRYPTION_KEY` 等现有值必须保持不变。
  - 在 `automationstack/k8s/automationstack-secrets.example.yaml` 中加入这个键名和占位值。
  - 把 `seed-admin-job.yaml` 标为已废弃。它把密码写入 Job 日志，引导管理员取代了它。
- 阶段 3 上线时：
  - 在 `automationstack-config` ConfigMap 中加入 `AUTH_PROVIDER`、`CASDOOR_ISSUER`、`CASDOOR_INTERNAL_URL`、`CASDOOR_ORGANIZATION`、`CASDOOR_REDIRECT_URL`、`CASDOOR_ADMIN_ROLE`。
  - 在 `automationstack-secrets` 中加入 `CASDOOR_CLIENT_ID`、`CASDOOR_CLIENT_SECRET`、`CASDOOR_WEBHOOK_SECRET`。与 aidevstack 相同，client id 也放在 Secret 中。
  - 不修改 Ingress（D12）。
  - 修改配置后，在 ArgoCD 中重启 `automationstack-server`，新值才会生效。

#### T17 Casdoor 控制台：手工配置（不在 Git 中）

Casdoor 的组织、应用和角色没有写在 Git 中，必须在 Casdoor 控制台中手工创建。按 `k8s-gitops/casdoor/README.md` §6、§7 的检查清单操作：

1. 在 §8 确认的组织中，创建应用 `automationstack`。按 aidevstack 的 `docs/runbook/管理员与权限.md` §2.3 设置：
   - 应用必须属于这个组织，「Is shared」关闭（否则 `aud` 会变化）。
   - 关闭注册和访客登录。
   - 授权类型只开启 `authorization_code` 和 `client_credentials`。不开启 `password`，本系统不代理 Casdoor 的密码登录。
   - Token 格式设为 `JWT`。其他格式没有角色，管理员下次登录时会变成普通成员。
   - 用户使用默认的 UUID id，「Is admin」关闭。
2. 回调地址填 `https://testcase.trendf.top/api/auth/casdoor/callback`。
3. 创建角色，角色名与 `CASDOOR_ADMIN_ROLE` 相同（例如 `automationstack-admin`）。把管理员用户加入这个角色。
   - 如果用脚本创建角色，脚本必须：明确指定组织并拒绝 `built-in`；可以重复运行；只增加成员，不删除成员；凭据通过标准输入传给 curl，不出现在进程列表中。（aidevstack `cffad68`）
   - Cloudflare Access 挡住公网地址，脚本必须在集群内运行，或使用集群内地址。
4. 配置 webhook：地址使用集群内地址（T11），请求头中加入 `CASDOOR_WEBHOOK_SECRET`。
5. 检查 Cloudflare Access 的策略：所有平台用户的邮箱域名都必须能通过。

## 5. 非目标

- 不把项目级权限（`project_members`）交给 Casdoor。
- 不把 API token 改为 Casdoor 签发。SDK、MCP 和 ingest 的调用方式不变。
- 不改会话机制。不做会话表，不做单个会话的撤销。
- ~~不做运行时热切换。切换模式必须重启。~~（已被 §10 取消：页面保存后立即生效。）
- 不迁移已有用户的密码到 Casdoor。评估文档 §3.1 说明了哈希格式不兼容。切换时由管理员在 Casdoor 中重置密码。
- 不处理 `/api/v1/*` 路由的 404 问题。它与本方案无关。

## 6. 验收标准

### 阶段 1

1. 空数据库，`AUTH_PROVIDER=local`，配置 `ADMIN_INITIAL_PASSWORD`：服务启动后，可以用 `admin` 和该密码登录。
2. 已有管理员时重启服务：不创建账号，不修改任何密码。
3. `NODE_ENV=production`，空数据库，没有配置 `ADMIN_INITIAL_PASSWORD`：服务拒绝启动，日志写明原因。
4. `NODE_ENV=production`，`ADMIN_INITIAL_PASSWORD` 等于开发默认值：服务拒绝启动。
5. 生产环境中，引导管理员第一次登录后只能访问修改密码页面。修改后可以正常使用。
6. 在服务镜像中执行 `reset-password.ts`：新密码生效，账号必须再次修改密码。
7. 日志、接口响应和进程参数中不出现任何明文密码。
8. 两个服务实例同时在空数据库上启动：只创建一个管理员。
8a. `NODE_ENV=production`，`SESSION_SECRET`、`SECRET_ENCRYPTION_KEY` 或 `ADMIN_INITIAL_PASSWORD` 等于开发默认值（包括大小写不同、首尾有空格）：服务拒绝启动，错误信息只写变量名（D14）。

### 阶段 2

9. `local` 模式下，现有登录、退出、限流、MCP、ingest 和 WebSocket 的行为不变。现有测试全部通过。

### 阶段 3

10. `casdoor` 模式：用 Casdoor 账号登录后，本地 `users` 表中出现对应行，`auth_source = casdoor`。
11. 在 Casdoor 中给用户加上 `CASDOOR_ADMIN_ROLE`：webhook 到达后，该用户获得平台 admin 权限，不需要重新登录。
11a. 在 Casdoor 中把用户移出 `CASDOOR_ADMIN_ROLE`：webhook 到达后，或下次登录时，或下次对账后，该用户变成 member。ID token 中没有 `roles` 时，用户也是 member。
12. 在 Casdoor 中禁用用户：webhook 到达后，该用户的 cookie 和 API token 立即失效。
12a. 停止 webhook，在 Casdoor 中禁用用户：下次对账后，该用户的 cookie 和 API token 失效（D13）。
12b. 任何本系统的接口都不能修改 Casdoor 用户的角色和禁用状态（T12）。
13. webhook 请求头中的密钥错误：返回 401，数据不变。
14. `AUTH_ALLOW_LOCAL_LOGIN` 使用默认值：Casdoor 停止时，引导管理员仍然可以用本地密码登录。本地普通用户不能用本地密码登录。`AUTH_ALLOW_LOCAL_LOGIN=false` 时，本地密码登录完全关闭。
14a. 服务端日志中，授权地址是公网地址，token 地址是集群内地址（D11）。
15. 从 `casdoor` 切回 `local`：服务可以启动。已有的项目、成员和 API token 数据不变。

### 通用

16. `pnpm check-types`、`pnpm test` 和 `pnpm dlx ultracite check` 全部通过。
17. 本地数据库或 Casdoor 不可用时，对应的验收项标记为「未验证」并写明原因，不得伪造结果。

## 7. 风险

- **Casdoor 成为登录的单点故障。** Casdoor 停止时，没有人能登录。D7 的应急登录可以降低这个风险。
- **用户名冲突。** 不按用户名关联账号（§2 第 4 项），所以 Casdoor 用户与本地用户同名时，Casdoor 用户不能登录。切换前，管理员必须检查同名账号。
- **webhook 丢失会造成禁用状态不同步。** 被禁用的用户的 API token 会继续有效，直到下一次同步。T9 必须确认 Casdoor 的重试机制。
- **双模式增加测试量。** 两种模式都必须有自动测试。
- **退出登录不退出 Casdoor（§2 第 6 项）。** 用户在本系统退出后，Casdoor 的登录状态还在。再点「使用 Casdoor 登录」时，用户不需要输入密码就会直接登录。在共用电脑上，这是一个风险。
- **`ADMIN_INITIAL_PASSWORD` 留在部署配置中。** 引导管理员修改密码后，这个值不再有效，但仍然留在 Secret 中。文档必须建议上线后删除它。
- **新依赖 `openid-client`**：需要用户批准（D8）。
- **Cloudflare Access 挡在 Casdoor 前面。** 用户先通过 Access 登录，再进入 Casdoor 登录。Access 和 Casdoor 是两套用户列表，必须分别维护（`k8s-gitops/casdoor/README.md` §9）。
- **Casdoor 只有一个副本。** 它的会话存在文件中，不能扩容。Casdoor 重启时，登录暂时不可用。D7 的应急登录可以降低这个风险。
- **生产环境的 cookie 没有 `Secure` 属性。** TLS 在 Cloudflare 终止，服务端收到的是 `http://` 请求。OIDC 的 state cookie 也受影响。这是现有问题，本方案不修复，但 T10 必须使用 `SameSite=Lax`，否则从 Casdoor 跳回时 cookie 会丢失。
- **`automationstack-secrets` 还没有提交到 Git。** `k8s-gitops/automationstack/k8s/sealed/kustomization.yaml` 中 `resources: []`，集群中的 Secret 可能是手工创建的。T16 重新封装前，必须先确认现有 Secret 的全部键值。
- **用户名快照不同步**：`test_cases.last_modified_by` 和 `case_versions.saved_by` 存的是用户名文本。Casdoor 中改名后，历史记录中的用户名不变（评估文档 §7）。

## 8. Casdoor 部署（来自 `k8s-gitops`，2026-10-08 只读调研）

| 项目 | 现状 | 位置 |
| --- | --- | --- |
| 版本 | `casbin/casdoor:4.11.0`，手工更新版本 | `casdoor/k8s/kustomization.yaml:123-129` |
| 命名空间和服务 | 命名空间 `casdoor`，Service `casdoor`，端口 8000 | `casdoor/k8s/service.yaml` |
| 集群内地址 | `http://casdoor.casdoor.svc.cluster.local:8000` | `casdoor/README.md:68-81` |
| 公网地址 | `https://casdoor.trendf.top`，经 Cloudflare Tunnel，前面有 Cloudflare Access | `casdoor/k8s/cloudflared.yaml` |
| `origin` 配置 | `https://casdoor.trendf.top`。`CASDOOR_ISSUER` 必须与它逐字相同 | `casdoor/k8s/configmap.yaml:85` |
| 数据库 | 宿主机上的共享 Postgres（`10.0.0.5:5432`），独立的数据库 `casdoor` | `casdoor/k8s/configmap.yaml:48-58` |
| 副本 | 1 个，`Recreate` 策略 | `casdoor/k8s/deployment.yaml:31,38` |
| 组织、应用、角色 | 不在 Git 中，在控制台手工创建 | `casdoor/README.md:567-589` |
| 已接入的应用 | aidevstack，组织 `built-in` | `aidevstack/k8s/aidevstack.yaml:97-127` |

automationstack 的生产部署：

- 域名 `testcase.trendf.top`。Ingress 把 `/api`、`/rpc`、`/ws`、`/mcp`、`/ingest`、`/api-reference`、`/health` 转发给 server，其他路径转发给 web。
- server 只有 1 个副本（实时协作和登录限流在进程内存中）。
- 数据库迁移由 ArgoCD 的 Sync hook Job 执行（sync-wave 1），先于 server（sync-wave 2）。所以 T3 的引导管理员运行时，迁移已经完成。
- 环境变量来自 ConfigMap `automationstack-config` 和 Secret `automationstack-secrets`。

### 已确认

- **组织**：新建 `automationstack` 组织（§2 第 9 项）。以下是当时的分析，保留作记录。
- **不使用 `built-in`。** `built-in` 中的每个用户都是 Casdoor 的全局管理员（aidevstack `docs/runbook/管理员与权限.md`）。可以选择：
  - 与 aidevstack 共用一个专用组织（aidevstack 的手册计划使用 `aidevstack` 组织）：用户只维护一套账号。
  - 新建 `automationstack` 组织：账号与 aidevstack 完全隔离。
- 注意：k8s-gitops 中 aidevstack 的生产配置仍然是 `CASDOOR_ORGANIZATION: "built-in"`（`aidevstack/k8s/aidevstack.yaml:127`），与它自己的新手册不一致。共用组织时，必须先完成 aidevstack 的迁移。

## 9. 修订记录

- **2026-10-08 对照 aidevstack 的认证修复**（`353b16e`、`4404d09`、`c6bde60`、`a160500`、`cffad68`）：
  - D4：角色同步改为覆盖，`roles` 缺失时为 member；只接受本组织的角色；使用专用角色名。
  - D11：`authorization_endpoint` 也要改写；地址只接受不带路径的格式；增加 `openid-client` 的验证项。
  - 新增 D13（定期对账）、D14（拒绝开发密钥）、D15（应急操作的记录）。
  - T9、T10、T11、T12、T13、T17 增加对应的要求；新增 T11a。
  - §8：不使用 `built-in` 组织。
  - 阶段 1 的补充修复：D14、D15 中与阶段 1 有关的部分；`seed-admin` 不再从命令参数读取密码；引导管理员的错误提示按原因区分。

## 10. 认证设置页面（2026-10-08 追加，修订 D1）

用户决定：管理员在页面中切换认证方式和配置 Casdoor。**页面配置优先于环境变量**。实现参照 aidevstack 的「认证设置」（`backend/internal/system/service/auth_settings.go`、`frontend/src/features/system/AuthSettingsCard.tsx`）。

### 10.1 与 aidevstack 的相同点和不同点

| 项目 | aidevstack | 本系统 | 原因 |
| --- | --- | --- | --- |
| 存储 | `platform_settings` 表，JSONB | 单行表 `auth_settings`，固定列 | 字段固定，用固定列可以做类型检查和约束。 |
| 优先级 | 数据库有值时用数据库，环境变量只是默认值 | 相同 | 用户决定。 |
| 来源显示 | 页面显示「控制台保存 / 环境变量」 | 相同 | 防止运维人员以为改了环境变量就生效。 |
| 集群内地址 | 只能在环境变量中设置 | 相同 | 它是部署结构，不是业务配置。 |
| client secret 返回前端 | 从不返回，只返回「已设置」 | 相同 | |
| 没有加密密钥时 | 改存明文，只写警告 | **拒绝保存** | 与本系统 Jira 配置的做法一致。不存明文密钥。 |
| 生效方式 | 登录配置要重启服务 | **保存后立即生效** | 本系统只有 1 个副本，进程内刷新即可。 |
| 保存前测试连接 | 不要求 | **切换到 Casdoor 或在 Casdoor 模式下保存时，服务端必须重新测试，全部通过才保存** | 防止错误配置把所有人挡在外面。 |
| 地址校验 | 允许带路径 | 只接受不带路径的地址（D11） | |
| 应急登录 | 环境变量中的运维密钥，只能用在请求头中 | 本地管理员账号（D7），开关只在环境变量中 | 页面不能关闭应急登录，否则错误操作后无法恢复。 |
| 管理员角色名 | 写死在代码中 | 页面中配置 | 本系统要与 aidevstack 使用不同的角色名（D4）。 |
| 测试连接 | 测试表单中未保存的值；secret 为空时用已保存的值；分步报告；总时限 12 秒 | 相同，另外增加「管理员角色存在」一步 | |
| 修改记录 | 只有通用的请求记录，没有字段差异 | 新增修改记录表 | 本系统没有审计模块（D15）。 |

### 10.2 配置项的来源

| 配置 | 页面可以修改 | 环境变量 | 说明 |
| --- | --- | --- | --- |
| 认证方式（local / casdoor） | 是 | `AUTH_PROVIDER`，作为默认值 | |
| 公网地址 | 是 | `CASDOOR_ISSUER`，作为默认值 | |
| 组织 | 是 | `CASDOOR_ORGANIZATION`，作为默认值 | 不能是 `built-in`。 |
| Client ID | 是 | `CASDOOR_CLIENT_ID`，作为默认值 | |
| Client Secret | 是，只写 | `CASDOOR_CLIENT_SECRET`，作为默认值 | 加密保存。 |
| 回调地址 | 是 | `CASDOOR_REDIRECT_URL`，作为默认值 | 必须以 `/api/auth/casdoor/callback` 结尾。页面按当前域名预填。 |
| 管理员角色名 | 是 | `CASDOOR_ADMIN_ROLE`，作为默认值 | |
| Webhook 密钥 | 是，只写，可以生成 | `CASDOOR_WEBHOOK_SECRET`，作为默认值 | 加密保存。 |
| 集群内地址 | 否，只读显示 | `CASDOOR_INTERNAL_URL` | 部署结构。 |
| 应急登录 | 否，只读显示 | `AUTH_ALLOW_LOCAL_LOGIN` | 页面不能关闭应急登录。 |
| 会话密钥、加密密钥、引导管理员 | 否 | `SESSION_SECRET`、`SECRET_ENCRYPTION_KEY`、`ADMIN_*` | |

- 数据库中没有 `auth_settings` 行时，使用环境变量的值，页面显示来源为「环境变量」。
- 管理员在页面中保存一次后，使用数据库的值，页面显示来源为「页面配置」。之后修改环境变量不生效，页面上要写明这一点。

### 10.3 存储

- 新表 `auth_settings`，只有一行（`CHECK (id = 1)`）。列：`provider`、`issuer`、`organization`、`client_id`、`client_secret_cipher`、`redirect_url`、`admin_role`、`webhook_secret_cipher`、`last_test_ok_at`、`updated_by`（用户删除时设为 null）、`updated_at`。
- 密钥用现有的 `packages/db/src/secret-box.ts` 和 `SECRET_ENCRYPTION_KEY` 加密。
- 没有配置 `SECRET_ENCRYPTION_KEY`，或者密钥无法解密时：页面显示提示，保存返回 `PRECONDITION_FAILED`。做法与 Jira 配置相同（`credential-problem-notice.tsx`）。
- 密钥字段的更新分三种：保留、设置、清空。只有在 local 模式下才能清空 client secret。
- 新表 `settings_change_log`：操作人、时间、配置名、修改了哪些字段。密钥只记录「已修改」或「已清空」，不记录值。

### 10.4 立即生效

- 新增 `packages/api/src/auth/settings-store.ts`：在内存中缓存解密后的配置。保存成功后立即刷新缓存。另外每 30 秒检查一次 `updated_at`，防止以后有多个副本时读到旧值。
- OIDC 客户端按配置的指纹（公网地址、集群内地址、client id、secret 的哈希、回调地址）缓存。指纹变化后重新创建。发现文档读取失败时不缓存。
- 登录、回调、webhook 校验、定期对账（D13）、`auth.config` 和 `/health` 都从这个缓存读取配置。
- 登录开始时，把配置指纹写入 state cookie。回调时指纹不同，登录失败，提示「认证配置已变更，请重新登录」。
- 切换到 Casdoor 后，本地普通用户的现有会话立即失效（在 `context.ts` 中检查）。本地管理员的会话保持有效。

### 10.5 防止所有人被挡在外面

1. 切换到 Casdoor，或者在 Casdoor 模式下保存时，服务端用提交的值重新测试连接（发现文档和 JWKS、`client_credentials`、组织、管理员角色）。任何一步失败，都不保存。
2. 切换到 Casdoor 前，必须满足：`AUTH_ALLOW_LOCAL_LOGIN=true`，并且有至少一个可以本地登录的管理员（`countLocalLoginAdmins() > 0`）。否则拒绝切换。
3. 生产环境中，公网地址必须是 `https`。
4. 切换认证方式前，页面显示确认对话框，列出后果：Casdoor 用户没有本地密码；本地普通用户的会话会失效；切回 local 后，Casdoor 用户必须由管理员重置密码才能登录。
5. 恢复途径：新增运维命令 `scripts/auth-set-local.ts`，在 pod 中执行，把认证方式改回 local，并写 WARN 日志。命令格式与 `reset-password.ts` 相同。

### 10.6 页面

- 路由 `/settings/auth`，名称「认证设置」。只有平台管理员可以进入，侧边栏中放在「用户」旁边。权限检查参照 `routes/users.tsx` 和 `platform-users-page.tsx`。服务端接口使用 `adminProcedure`。
- 页面内容：
  1. **状态**：当前认证方式、配置来源（页面配置或环境变量）、应急登录是否开启（只读）、最后一次测试成功的时间、最后修改人和时间。
  2. **认证方式**：本地或 Casdoor。
  3. **Casdoor 连接**：公网地址、集群内地址（只读）、组织、Client ID、Client Secret（只写，复用 `jira-secret-field.tsx` 的做法）、回调地址（可以复制）。
  4. **角色映射**：管理员角色名。
  5. **Webhook**：webhook 地址（集群内地址，可以复制）、webhook 密钥（只写，可以生成或清空）。
  6. **测试连接**：按钮和分步结果，每一步显示「通过 / 失败 / 跳过」。参照 aidevstack 的 `AuthConnectionChecks.tsx`。
  7. **保存**：认证方式变化时，先显示 §10.5 第 4 项的确认对话框。
- 接口：`authSettings.get`、`authSettings.testConnection`、`authSettings.save`，都使用 `adminProcedure`。

### 10.7 对任务的影响

- **阶段 2** 增加 T7a：`auth_settings` 表、`settings_change_log` 表、`settings-store.ts`、`authSettings.get` 和 `authSettings.save`（这时只能保存 local 模式）。T7 的 `auth.config` 改为从 `settings-store` 读取。
- **阶段 2** 增加 T8a：认证设置页面。Casdoor 选项在阶段 3 完成前不能选择，显示「尚未实现」。
- **阶段 3** 增加：`authSettings.testConnection`、Casdoor 模式的保存和 §10.5 的全部检查、`scripts/auth-set-local.ts`。
- T13 的「测试连接」接口由 §10 的 `authSettings.testConnection` 取代。
- T16：k8s-gitops 中只需要设置 `CASDOOR_INTERNAL_URL` 和 `AUTH_ALLOW_LOCAL_LOGIN`。其他 Casdoor 参数可以在页面中配置，不必写入 ConfigMap 和 Secret。
- 阶段 1 已经加入的 `AUTH_PROVIDER` 环境变量保留，改为默认值。阶段 1 的代码不需要修改。

### 10.8 增加的验收标准

18. 在页面中把认证方式从 local 改为 Casdoor，不重启服务，下一次登录就使用 Casdoor。
19. Casdoor 配置错误（例如 client secret 错误）时，保存失败，页面显示失败的步骤，当前配置不变。
20. `AUTH_ALLOW_LOCAL_LOGIN=false`，或者没有可以本地登录的管理员时，不能切换到 Casdoor。
21. 没有配置 `SECRET_ENCRYPTION_KEY` 时，不能保存 client secret，页面显示原因。
22. 接口响应、日志和修改记录中都不出现 client secret 和 webhook 密钥的值。
23. 非管理员访问 `/settings/auth` 时看到「无权限」页面，调用 `authSettings.*` 接口返回 `FORBIDDEN`。
24. 页面保存过配置后，修改环境变量中的 Casdoor 参数不生效，页面显示来源为「页面配置」。
25. 在 Casdoor 模式下执行 `scripts/auth-set-local.ts`：认证方式变回 local，本地用户可以登录。
26. 切换到 Casdoor 后，本地普通用户的旧会话失效，本地管理员的会话仍然有效。

## 11. T9 验证结果（2026-10-09）

环境：本地 `casbin/casdoor:4.11.0`（`make casdoor-up`，`origin=http://localhost:8100`），组织 `automationstack`，应用 `automationstack`（Token 格式 `JWT`，授权类型 `authorization_code` + `client_credentials`），角色 `automationstack-admin`，测试用户 `alice`（在角色中）和 `bob`（不在角色中）。对象由 `make casdoor-bootstrap` 创建。`openid-client` 版本 6.8.8（`oauth4webapi` 3.8.8），只装在临时目录中，没有加入 `package.json`。

模拟 D11 的地址分离：`CASDOOR_ISSUER` = `http://localhost:8100`（公网地址），`CASDOOR_INTERNAL_URL` = `http://127.0.0.1:8100`（集群内地址）。

本节的「源码」指 Casdoor v4.11.0 的源码。

### 11.1 ID token 的字段（Token 格式 `JWT`）

| 字段 | 值的格式 | 说明 |
| --- | --- | --- |
| `sub` | UUID，例如 `4e1fe32c-…` | 等于 Casdoor 用户的 `id`。不是 `组织/用户名`。 |
| `id` | UUID | 与 `sub` 相同。 |
| `owner` | `"automationstack"` | 用户所属的组织。 |
| `name` | `"alice"` | 用户名。 |
| `displayName` | 字符串 | 显示名。 |
| `email` | 字符串 | |
| `roles` | 对象数组 | 每一项是 `{owner, name, displayName, description, users: null, groups, roles, domains, isEnabled}`。不是字符串。没有角色时是 `[]`，不是缺失。 |
| `isForbidden` | 布尔 | |
| `isDeleted` | 布尔 | |
| `isAdmin` | 布尔 | Casdoor 的组织管理员标志，与本系统无关。 |
| `iss` | `"http://localhost:8100"` | 等于 `origin`。 |
| `aud` | `["<client id>"]` | 数组。应用的 Is shared 打开时变为 `<client id>-org-<组织>`。 |
| `azp` | client id | |
| `nonce` | 原样返回 | |
| `tokenType` | `"id-token"` | access token 中是 `"access-token"`。 |

- 签名：`RS256`，`kid` = `cert-built-in`（应用的证书）。
- 用户的密码字段在 token 中是空字符串。
- 角色被关闭（`isEnabled: false`）后，它仍然出现在 ID token 的 `roles` 中，`isEnabled` 是 `false`（实测）。所以必须检查 `isEnabled`。
- userinfo（`/api/userinfo`）也有 `roles`，但格式是**角色名的字符串数组**（例如 `["automationstack-admin"]`），**没有组织**。没有角色时没有这个字段。所以不能用 userinfo 判断角色。

### 11.2 `JWT-Standard` 和 `JWT-Empty`

| 格式 | ID token 中的角色 | 用户名所在的字段 | `name` 的含义 |
| --- | --- | --- | --- |
| `JWT` | `roles`（对象数组） | `name` | 用户名 |
| `JWT-Standard` | 没有 | `preferred_username` | **显示名** |
| `JWT-Empty` | 没有 | `name` | 用户名 |

- 三种格式中 `sub`、`owner`、`iss`、`aud` 相同。
- `JWT-Standard` 中 `name` 是显示名。代码按 `JWT` 格式读取 `name` 时，会把显示名当作用户名。

### 11.3 发现文档和地址分离

从 `http://localhost:8100/.well-known/openid-configuration` 读取：

| 字段 | 值 |
| --- | --- |
| `issuer` | `http://localhost:8100` |
| `authorization_endpoint` | `http://localhost:8100/login/oauth/authorize` |
| `token_endpoint` | `http://localhost:8100/api/login/oauth/access_token` |
| `jwks_uri` | `http://localhost:8100/.well-known/jwks` |
| `userinfo_endpoint` | `http://localhost:8100/api/userinfo` |

- 用 `http://127.0.0.1:8100`、容器内的 `http://127.0.0.1:8000`、`Host: casdoor.casdoor.svc.cluster.local:8000` 读取，结果完全相同。
- 结论：`origin` 固定时，发现文档中的全部地址都是 `origin`，不随请求的 Host 头变化。
- 生产的 `origin` 是公网地址。所以服务端从集群内地址读到的 `token_endpoint` 和 `jwks_uri` 是公网地址。公网地址前面有 Cloudflare Access，所以服务端必须把它们改为集群内地址。改写的原因是这一点，不是 D11 中写的「地址来自 Host 头」。

### 11.4 `openid-client` v6

| 问题 | 结果 |
| --- | --- |
| (a) 从集群内地址读取发现文档，`iss` 是公网地址 | **可以**，但必须传完整的发现地址。`discovery(new URL(CASDOOR_INTERNAL_URL))` 会失败：`OAUTH_JSON_ATTRIBUTE_COMPARISON_FAILED`（issuer 与 URL 不同）。`discovery(new URL("/.well-known/openid-configuration", CASDOOR_INTERNAL_URL))` 不比较 issuer，服务端必须自己检查 `issuer === CASDOOR_ISSUER`。 |
| (b) 改写地址 | **可以**。用 `serverMetadata()` 取出元数据，改写后传给 `new Configuration(...)`。 |
| (c) PKCE + state + nonce | **可以**。`randomPKCECodeVerifier`、`calculatePKCECodeChallenge`、`randomState`、`randomNonce`、`buildAuthorizationUrl`、`authorizationCodeGrant(config, url, { pkceCodeVerifier, expectedState, expectedNonce, idTokenExpected: true })`。Casdoor 只支持 `S256`。 |
| (d) `client_secret_basic` | **可以**。`ClientSecretBasic(secret)`。token 请求带 `Authorization: Basic`。 |
| http 地址 | 开发环境和集群内地址是 http，必须调用 `allowInsecureRequests(config)`。 |
| 签名校验 | `openid-client` 默认**不校验** token 端点返回的 ID token 签名（规范允许，因为是 TLS 直连）。集群内地址是 http，所以必须调用 `enableNonRepudiationChecks(config)`。调用后，它从改写后的集群内 `jwks_uri` 读取 JWKS，校验通过。 |
| `clientCredentialsGrant` | **失败**：Casdoor 返回 `"refresh_token": ""`，`oauth4webapi` 拒绝空字符串（`OAUTH_INVALID_RESPONSE`）。管理 API 的 token 必须用普通 `fetch` 获取（11.6）。 |

实测的请求记录：发现文档、token、JWKS、userinfo 都发往集群内地址；授权地址是公网地址。

最小代码（已在本地运行通过）：

```ts
import * as client from "openid-client";

const discovered = await client.discovery(
  new URL("/.well-known/openid-configuration", internalUrl),
  clientId,
  undefined,
  client.ClientSecretBasic(clientSecret),
  { execute: [client.allowInsecureRequests] }, // 只在地址是 http 时使用
);
const md = discovered.serverMetadata();
if (md.issuer !== issuer) throw new Error("issuer 与 CASDOOR_ISSUER 不同");
const swap = (u: string, origin: string) => new URL(new URL(u).pathname + new URL(u).search, origin).href;
const config = new client.Configuration(
  {
    ...md,
    authorization_endpoint: swap(md.authorization_endpoint!, issuer),
    token_endpoint: swap(md.token_endpoint!, internalUrl),
    jwks_uri: swap(md.jwks_uri!, internalUrl),
    userinfo_endpoint: swap(md.userinfo_endpoint!, internalUrl),
  },
  clientId,
  { redirect_uris: [redirectUrl] },
  client.ClientSecretBasic(clientSecret),
);
client.allowInsecureRequests(config); // 只在地址是 http 时使用
client.enableNonRepudiationChecks(config); // 校验 ID token 签名

// 登录
const codeVerifier = client.randomPKCECodeVerifier();
const state = client.randomState();
const nonce = client.randomNonce();
const url = client.buildAuthorizationUrl(config, {
  redirect_uri: redirectUrl,
  scope: "openid profile email",
  code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
  code_challenge_method: "S256",
  state,
  nonce,
});

// 回调
const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
  pkceCodeVerifier: codeVerifier,
  expectedState: state,
  expectedNonce: nonce,
  idTokenExpected: true,
});
const claims = tokens.claims(); // sub、owner、name、roles、isForbidden、isDeleted
```

### 11.5 授权码流程

- 不用浏览器也可以完成。Casdoor 登录页提交的是 `POST /api/login?clientId=…&responseType=code&redirectUri=…&scope=…&state=…&nonce=…&code_challenge_method=S256&code_challenge=…`，请求体是 `{application, organization, username, password, type: "code", signinMethod: "Password"}`，响应的 `data` 是授权码。
- 测试用这个方式取得授权码，再用 `openid-client` 换取 token。**没有开启 `password` 授权类型。**
- 应用没有开启 `refresh_token` 授权类型，刷新 token 返回 `unsupported_grant_type`。本系统不需要刷新。

### 11.6 管理 API（`client_credentials`）

取 token：`POST {内部地址}/api/login/oauth/access_token`，请求头 `Authorization: Basic base64(client_id:client_secret)`，请求体 `grant_type=client_credentials`。

- 返回 `{access_token, refresh_token: "", token_type: "bearer", expires_in: 604800, scope: ""}`。
- token 中 `sub` = `admin/automationstack`，`type` = `application`。有效期 7 天，可以缓存。
- 调用管理 API 时使用 `Authorization: Bearer <token>`。

| 调用 | 结果 |
| --- | --- |
| `get-users?owner=automationstack` | 不带分页参数时返回**全部**用户，`data2` 是 `null`。没有默认页大小。 |
| `get-users?owner=automationstack&p=1&pageSize=N` | 返回一页，`data2` 是总数。`p` 从 1 开始。 |
| `get-users` 中的每个用户 | `roles` 是 `null`。成员关系必须用 `get-role` 读取。 |
| `get-user?id=automationstack/alice` | 用户对象，有 `id`、`isForbidden`、`isDeleted`、`roles`（对象数组）。密码是 `***`。 |
| `get-user?owner=automationstack&userId=<uuid>` | 同上。不带 `owner` 也可以。 |
| `get-roles?owner=automationstack`（可以分页） | 角色数组，分页规则与 `get-users` 相同。 |
| `get-role?id=automationstack/automationstack-admin` | `users` 是 `["automationstack/alice"]`，即 `组织/用户名` 字符串。 |
| `get-organization?id=admin/automationstack` | 组织对象。 |
| 对象不存在（用户或角色） | `status: "ok"`，`data: null`。**不是错误。** |

应用属于非 built-in 组织时的权限（源码：应用作为它所属组织的管理员）：

- 可以读取本组织的用户、角色和组织。
- 可以修改本组织的对象：实测用这个 token 执行 `update-role` 成功。所以 client secret 等于本组织的管理员权限。
- 读取其他组织（`built-in` 的用户、角色、组织，其他组织用户的 `userId`）返回 `Unauthorized operation`。
- `get-organizations`、`get-account`、`get-webhooks` 不能使用。

### 11.7 Webhook

请求格式（实测）：

- 方法 `POST`，`Content-Type: application/json`，`User-Agent: Go-http-client/1.1`。
- 自定义请求头原样发送（测试中是 `X-Casdoor-Webhook-Secret`）。没有签名。
- 请求体是 Casdoor 的操作记录（Record）：

```json
{
  "id": 0,
  "owner": "built-in",
  "name": "<uuid>",
  "createdTime": "2026-10-09T06:56:36Z",
  "organization": "built-in",
  "clientIp": "192.168.107.1",
  "user": "admin",
  "method": "POST",
  "requestUri": "/api/update-role?id=automationstack/automationstack-admin",
  "action": "update-role",
  "language": "en",
  "object": "{\"owner\":\"automationstack\",\"name\":\"automationstack-admin\",\"users\":[\"automationstack/alice\",\"automationstack/bob\"],…}",
  "response": "{status:\"ok\", msg:\"\"}",
  "statusCode": 200,
  "detail": "",
  "isTriggered": false,
  "extendedUser": null
}
```

| 字段 | 含义 |
| --- | --- |
| `action` | 事件名，等于 API 名：`add-user`、`update-user`、`delete-user`、`update-role`、`add-role`、`delete-role`。 |
| `organization`、`user` | **操作人**的组织和用户名，不是被修改对象的组织。 |
| `requestUri` | 原始请求地址。`update-*` 中有 `id=组织/名字`。 |
| `object` | **字符串**，内容是原始请求体的 JSON。密码被替换为 `***`。 |
| `response` | **字符串**，不是合法 JSON，例如 `{status:"ok", msg:""}`。 |
| `statusCode` | 失败的操作也是 200。 |

各事件中用户和角色的表示：

| 操作 | `action` | 对象的表示 |
| --- | --- | --- |
| 修改用户 | `update-user` | `requestUri` 中是 `组织/用户名`；`object` 中有 `owner`、`name`，控制台发送完整对象时还有 `id`（UUID）。 |
| 禁用或启用用户 | `update-user` | 同上，`object.isForbidden` 是新值。没有单独的事件。 |
| 删除用户 | `delete-user` | `requestUri` 中没有 id。`object` 是请求体，控制台发送完整对象，有 `owner`、`name`、`id`。 |
| 创建用户 | `add-user` | `object` 中有 `owner`、`name`，**没有 `id`**（id 由服务端生成）。 |
| 修改角色成员 | `update-role` | `object.users` 是 `组织/用户名` 字符串数组。 |

- **失败的操作也发送 webhook。** 实测：修改不存在的用户，webhook 照常发送，`response` 是 `{status:"error", msg:"The user: automationstack/ghost doesn't exist"}`。所以 `object` 不能作为事实，服务端必须用管理 API 重新读取。
- 组织 `enableSoftDeletion` 关闭时（默认），删除是物理删除，管理 API 不再返回这个用户。

发送机制（实测和源码）：

- 发送是异步的。事件先写入 `webhook_event` 表，后台任务每 30 秒发送一次。
- 失败后重试，默认 3 次，间隔 60 秒，可以设置指数退避。之后状态为 `Failed`，不再发送。
- 发送时 webhook 已被关闭，事件直接失败，不再发送。
- **后台任务只在 Casdoor 启动时检查有没有 webhook。** 没有 webhook 时不启动。第一次创建 webhook 后，必须重启 Casdoor。实测：重启前事件停在 `Pending`。
- **组织不是 `built-in` 的 webhook 不能访问内网地址。** 源码 `object/webhook_util.go` 对这种 webhook 使用只允许公网地址的 HTTP 客户端。实测：组织为 `automationstack`、地址为内网地址的 webhook 失败，错误是 `the address: 192.168.107.2:5432 is not allowed, only Internet addresses can be requested`；组织为 `built-in` 的相同 webhook 可以连接。生产的集群内地址是内网地址，所以 webhook 必须建在 `built-in` 组织中。
- `singleOrgOnly` 比较的是操作人的组织。打开后，`automationstack` 的应用或管理员做的修改不会发送给 `built-in` 的 webhook。所以必须关闭 `singleOrgOnly`，服务端自己按对象的组织过滤。

### 11.8 禁用的用户

- 登录被拒绝：`/api/login` 返回 `The user is forbidden to sign in, please contact the administrator`，不签发授权码。
- 设置 `isForbidden` 时，Casdoor 立即使这个用户的全部 token 过期，并删除他的 Casdoor 会话（源码 `terminateUserAccess`）。实测：旧 access token 调用 userinfo 返回 `Access token has expired`，introspect 返回 `active: false`。
- 已签发的 JWT 在离线校验时仍然有效，直到 `exp`。本系统的 cookie 和 API token 不受影响。所以 T11 和 T11a 仍然必须做。

### 11.9 字段映射

T10（登录回调，读 ID token）：

| 本系统 | 来源 | 规则 |
| --- | --- | --- |
| `users.external_id` | `sub` | 为空时登录失败。 |
| 组织检查 | `owner` | 必须等于配置的组织，否则登录失败。 |
| `users.username` | `name` | 只用于显示和新建行。 |
| `users.role` | `roles` | `roles.some(r => r.owner === 组织 && r.name === 管理员角色名 && r.isEnabled === true)` 为 admin，否则 member。`roles` 不是数组时为 member。 |
| 登录拒绝 | `isForbidden`、`isDeleted` | 任何一个为 true，登录失败。 |
| `iss` | | 必须等于 `CASDOOR_ISSUER`。 |
| `aud` | | 必须包含 client id（`openid-client` 自动检查）。 |

T11（webhook）：

| 事件 | 处理 |
| --- | --- |
| 全部 | 先校验密钥请求头。然后从 `requestUri` 的 `id=` 或 `object` 中取出对象的组织，不是配置的组织就返回 200 并忽略。立即返回 200，再异步处理。 |
| `update-user`、`add-user` | 取出 `组织/用户名`，用管理 API `get-user?id=组织/用户名` 重新读取。按返回的 `id` 匹配 `external_id`，同步 `isForbidden`、`isDeleted` 和角色。不信任 `object` 中的值。 |
| `delete-user` | 用 `object.id` 匹配 `external_id`，并先用 `get-user?userId=<id>` 确认用户已不存在，再设置 `disabled_at`。`object` 中没有 `id` 时不处理，由 T11a 处理。 |
| `update-role`、`add-role`、`delete-role` | 只处理名字等于管理员角色名的角色。用 `get-role` 重新读取成员（`组织/用户名`），再用 `get-user?id=` 逐个取得 `id`，按 `id` 更新。 |

T11a（对账）：

- `get-users?owner=<组织>&p=<页>&pageSize=<N>`，直到读完 `data2` 个用户。
- `get-role?id=<组织>/<管理员角色名>` 读取成员。成员是 `组织/用户名`，按用户列表转换为 `id`。
- 本地有 `external_id` 但 Casdoor 用户列表中没有的用户，设置 `disabled_at`。
- `get-role` 返回 `data: null`（角色不存在）时，不修改任何角色，只写日志。否则全部管理员会被降级。
- 角色的 `isEnabled` 是 `false` 时，全部成员按 member 处理。

### 11.10 需要修改的计划条目（2026-10-09 已采纳；与前文冲突时以本节为准）

> 设计补充：webhook 只是「立即对账」的触发信号（第 7 项）。所以生产环境是否配置 webhook，不影响代码。不配置时，定期对账（T11a）仍然保证同步，只是延迟最多一个对账周期。生产环境的 webhook 要建在 `built-in` 组织中，并重启共用的 Casdoor（第 10 项），这会影响 aidevstack，上线前由用户决定。

1. **D11**：改写地址的原因改为「生产的 `origin` 是公网地址，发现文档中的 `token_endpoint` 和 `jwks_uri` 指向 Cloudflare Access 后面的公网地址」。增加：用完整的发现地址调用 `discovery()`，服务端自己比较 `issuer`（11.4）。
2. **D8 / T10**：增加 `enableNonRepudiationChecks(config)`，校验 ID token 签名。`allowInsecureRequests` 只在地址是 http 时使用。
3. **D13 / T11a / T13**：管理 API 的 token 不用 `openid-client` 的 `clientCredentialsGrant`（Casdoor 返回空的 `refresh_token`），用普通 `fetch` 和 Basic 头。
4. **D13 / T11a**：管理 API 中对象不存在时返回 `status: "ok"` 和 `data: null`。代码必须把它当作「不存在」，并区分「请求失败」。
5. **T10 / T11a**：角色从 ID token 的 `roles` 对象数组中读取，同时比较 `owner`、`name`，并要求 `isEnabled === true`。不使用 userinfo 的 `roles`（没有组织）。T11a 读取的角色也要检查 `isEnabled`。
6. **T10 / T17**：Token 格式必须是 `JWT`。`JWT-Standard` 中 `name` 是显示名，会写错用户名。
7. **T11**：webhook 只作为触发信号，所有事件（不只角色事件）都通过管理 API 重新读取。原因：失败的操作也发送 webhook，`object` 是原始请求体。
8. **T11**：webhook 请求头名定为 `X-Casdoor-Webhook-Secret`。
9. **T11**：按对象的组织过滤事件，不按请求体的 `organization`（那是操作人的组织）。
10. **T17 第 4 步**：webhook 必须建在 `built-in` 组织中（只有 Casdoor 全局管理员可以创建），关闭 `singleOrgOnly`，事件选 `add-user`、`update-user`、`delete-user`、`add-role`、`update-role`、`delete-role`。这是生产 Casdoor 中第一个 webhook 时，创建后必须重启 Casdoor。另一个选择：webhook 建在 `automationstack` 组织中，地址用公网地址 `https://testcase.trendf.top/api/auth/casdoor/webhook`；这要求这个地址不被 Cloudflare Access 拦截，未验证。
11. **T17**：增加说明：`client_credentials` 的 token 有本组织的管理员权限（可以修改用户和角色）。client secret 必须按管理员凭据保护。
12. **§7 风险「webhook 丢失」**：T9 已确认重试机制：每 30 秒发送，默认重试 3 次，间隔 60 秒，之后放弃。T11a 必须保留。
13. **T9 原文「`JWT-Empty` 和 `JWT-Standard` 格式没有角色」**：ID token 中确认没有。但 userinfo 在所有格式中都有角色名（没有组织）。
14. **D10 / T14**：已实现。本地 Casdoor 的宿主机端口是 8100（8000 被其他项目占用），`origin` 是 `http://localhost:8100`。本地开发时 `CASDOOR_ISSUER` 和 `CASDOOR_INTERNAL_URL` 都可以是 `http://localhost:8100`。

### 11.11 未验证

- 组织打开 `enableSoftDeletion` 时 `delete-user` 的行为（应为设置 `isDeleted`）。生产按默认值关闭。
- 本系统 server 接收 webhook：本地 Casdoor 中的 webhook `automationstack-dev` 已指向 `http://host.docker.internal:3000/api/auth/casdoor/webhook`，但处于关闭状态。T11 完成后打开它。
- `client_secret` 中有需要 URL 编码的字符时 Basic 头是否正确。Casdoor 生成的 secret 只有十六进制字符，不受影响。
