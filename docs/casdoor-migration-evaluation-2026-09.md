# 把认证与用户管理迁到 Casdoor：可行性评估

调研日期：2026-09-09  ·  基线 commit：`5369b20`  ·  Casdoor 版本：master（Apache-2.0）

---

## 0. 结论先行

**可以迁，但不该整体迁。**

推荐形态是**混合式**：Casdoor 只接管「**你是谁**」（认证 + 账号目录 + 登录页），
本仓库继续持有「**你能干什么**」（项目成员、平台角色、API Token）以及一张
本地 `users` **影子表**。

理由压缩成一句：本仓库的 `users.id` 是 **10 张业务表、13 个外键**的指向目标
（`test_runs` 一张表就占了 5 个），而且用例的 `lastModifiedBy` / `savedBy` 存的是
**当时的用户名快照文本**。把 `users` 表整个搬走，等于要么改 13 个外键去指一张
外部服务的表（做不到），要么把这 13 处全改成无约束的文本列（把数据库的完整性
保证换成「但愿两边不漂」）。两条都不划算，而保留影子表的代价只有一条：
多一条单向同步。

如果只想要 SSO / LDAP / 企业微信登录，**第 6 节有一个不动数据模型的最小方案**，
工作量约为完整迁移的三分之一。先确认动机再选路线。

---

## 1. 现状盘点：认证这件事今天由哪些代码承担

| 关注点 | 位置 | 规模 |
| --- | --- | --- |
| 口令散列 | `packages/db/src/password.ts` | PBKDF2-HMAC-SHA256 / 600k 迭代 / 自描述串 |
| 会话令牌 | `packages/api/src/auth/session.ts` | HMAC-SHA256 签名的自包含 cookie，7 天，**无状态、不可单独吊销** |
| 会话解析 | `packages/api/src/context.ts` | `resolveUserFromCookies`：验签 → 每请求重读 `users` 行 → 判 `disabledAt` |
| 登录过程 | `packages/api/src/routers/auth.ts` | login / logout / me，带诱饵散列（防用户名枚举） |
| 登录限流 | `packages/api/src/lib/login-rate-limit.ts` | 三道闸全排在 KDF 之前（IP 窗口 / 失败退避 / 并发位） |
| 平台角色 | `packages/db/src/schema/users.ts` | `admin` / `member` 两档 |
| 项目角色 | `packages/db/src/schema/project-members.ts` | `owner` / `member` 两档，平台 admin 一律放行 |
| 授权闸门 | `packages/api/src/index.ts` | `protectedProcedure` / `adminProcedure` / `requireProjectMember` |
| 账号管理 UI | `apps/web/src/components/platform-users/` | 15 个文件，约 1790 行 |
| API Token | `packages/db/src/schema/api-tokens.ts` + `packages/api/src/auth/bearer.ts` | `as_` 前缀，SHA-256 存储，权限严格等于其主人 |

**四条不走 cookie 的认证旁路**，迁移时每一条都要单独处理：

1. `apps/server/src/realtime/handshake.ts` —— WS 升级请求，直接调
   `resolveUserFromCookies` + `getProjectRole`
2. `apps/server/src/mcp/identity.ts` —— `/mcp` 端点，只认 `Authorization: Bearer as_xxx`
3. `apps/server/src/ingest/*` —— SDK 上报端点，同样只认 Bearer
4. `packages/api/src/auth/bearer.ts` —— 上面两条共用的 Bearer 解析

---

## 2. Casdoor 是什么，能接管哪些

Go + Beego 后端，React 控制台，XORM 支持 PostgreSQL（可与现有 `postgres:18`
共用实例、单开一个库）。Apache-2.0，14.4k star，活跃维护。

协议面：OAuth 2.0 / OIDC / SAML 2.0 / CAS / LDAP / SCIM 2.0 / WebAuthn / TOTP。
数据模型是四层：`Organization`（租户）→ `User`（属且仅属一个组织）、
`Application`（一套 clientId/clientSecret/redirectUris/登录页）、`Provider`（外部 IdP）。
用户在 API 上按 `<org>/<username>` 寻址，另有一个稳定的 UUID `id` 字段。

逐项对照：

| 本仓库的东西 | Casdoor 能接管吗 | 判断 |
| --- | --- | --- |
| 口令散列与校验 | ✅ | 但**格式不兼容**，见 §3.1 |
| 登录页 / 登录限流 | ✅ | Casdoor 自带登录页与限流，`login-rate-limit.ts` 整个可删 |
| 会话令牌 | ✅ | 换成 OIDC access_token（JWT，用应用证书本地验签） |
| 账号 CRUD / 停用 | ✅ | `isForbidden` 对应 `disabledAt`；控制台或 `/api/add-user` 等 |
| 平台角色 admin/member | ⚠️ 能，但不建议 | Casdoor 的 `isAdmin` 是**组织管理员**，语义不是「本平台管理员」；用 `properties` 自定义字段更干净 |
| 项目成员 owner/member | ❌ 不建议 | 见 §3.3 |
| API Token（`as_`） | ❌ | Casdoor 的 Token 是 OAuth token，替代不了「一个人多枚、可单独吊销、给 SDK 用」的长期凭据 |
| 用例署名快照（用户名文本） | ❌ | 本地历史数据，与 IdP 无关 |
| MFA / LDAP / 企业微信登录 | ✅ | 这是迁过去**才有**的收益 |

---

## 3. 四处硬碰撞

### 3.1 口令散列迁不过去（已逐行核对源码，不是猜测）

Casdoor 的散列实现在 `cred/` 包，`GetCredManager` 支持八种：
`plain` / `salt`(sha256) / `sha512-salt` / `md5-salt` / `bcrypt` /
`pbkdf2-salt` / `argon2id` / `pbkdf2-django`。

其中 `pbkdf2-django` 的存储格式与本仓库**看起来一模一样**：

```
pbkdf2_sha256$<iterations>$<salt>$<hash_base64>
```

迭代次数从串里读、派生长度 32 字节、hash 用标准 base64 —— 三项全对得上。
**但盐的解释不同**：

```go
// cred/pbkdf2_django.go
saltBytes := []byte(salt)            // 把 salt 段当 ASCII 原文
```
```ts
// packages/db/src/password.ts
salt: fromBase64(saltBase64)         // 把 salt 段 base64 解码后当原始字节
```

同一条散列串，两边派生出的密钥不同 → **全体登录失败**。而且没法靠改写数据
绕过：要让 Casdoor 算对，得把 16 个随机字节原样塞进 `$` 分隔的串里，而那些
字节里出现 `0x24`（`$`）的概率约 6%，会把四段切成五段。

**三个选项**（按推荐度排序）：

| 方案 | 做法 | 代价 |
| --- | --- | --- |
| **A. 全员重置口令** | 迁移时给每人生成随机口令，走现有的管理员重置流程通知 | 一次性运维动作。账号本来就全由管理员创建（`scripts/seed-admin.ts` 说得很清楚，平台不开放自助注册），用户基数小，这是最诚实的做法 |
| **B. 影子迁移（lazy）** | 保留本地 login 路径一段时间；本地校验成功后，用明文调 Casdoor `/api/update-user` 设口令，由 Casdoor 按组织的 `bcrypt` 重新散列；之后该账号走 Casdoor | 过渡期两套登录并存，`password.ts` 与限流代码要多活一个版本；明文要经 TLS 送到 Casdoor |
| C. 给 Casdoor 提 PR | 加一个 `pbkdf2-b64salt` cred manager（约 40 行 Go，照抄 `pbkdf2_django.go` 改一行） | 上游合并周期不可控；在合并前只能跑自己的 fork 镜像 |

顺带一条对迁移有利的机制：`object/check.go:284` 有 `isOutdated` 判定 ——
用户自己的 `passwordType` 与组织不同时，**校验成功后自动用组织的算法重新散列**。
所以方案 B 只要撑到人人登录过一次即可自然收敛。

### 3.2 `users.id` 被 13 个外键指着，表不能搬

```
api_tokens.user_id (cascade)          project_members.user_id (cascade)
case_attachments.created_by           test_run_attachments.created_by
automation_executions.reported_by     integrations.updated_by
test_run_events.actor_id              test_run_case_events.actor_id
test_runs.created_by / reviewed_by / submitted_by / assignee_id / executed_by
```

**唯一可行的形态：本地 `users` 表继续存在，改成 Casdoor 的影子（projection）。**

改动很小：删掉 `passwordHash` 列，加一列 `casdoor_id`（Casdoor 的 UUID，唯一索引）。
`id` 保持现有 uuid 主键不变 —— **不要把主键换成 Casdoor 的 id**，那会让 13 个外键
的既有数据全部要重写，而收益只是省掉一次映射查询。

`role` 与 `disabledAt` 两列的**真相源**移到 Casdoor，本地那两列降级为缓存副本，
由 §5 的同步链路写入。

### 3.3 项目级授权不要搬

Casdoor 有 Casbin 驱动的 Role / Permission，理论上能表达
「alice 在 project-42 里是 owner」。但：

- 项目本身是**本仓库的数据**，`projects` 表在本地。授权规则搬到 Casdoor 之后，
  「建项目」这个动作要横跨两个服务写两处，中间任何一步失败都留下不一致；
- `requireProjectMember` 是**每个请求的热路径**，现在是一条走本地唯一索引的
  等值查询（`project_members_project_id_user_id_uq`）。换成跨进程 HTTP 调用
  Casbin enforce，延迟与故障面都是数量级的变化；
- `packages/api/src/lib/project-access.ts` 是「全仓唯一的授权判定真相」，
  `handshake.ts` 的文件头把这条约束写得很重。搬到 Casdoor 等于把这个真相
  拆成两半。

**建议：`project_members` 一行不动。** Casdoor 只回答「这是谁」，本地回答「他能进哪个项目」。

### 3.4 API Token 不要搬

`/mcp` 与 ingest 两条通道靠 `as_` token 认人，三份 SDK（Node/Python/Java）
和 `install-agent-skill.sh` 都围着这个格式建的。Casdoor 的 Token 对象是 OAuth
颁发物，生命周期与语义都不同。

`packages/api/src/auth/bearer.ts` 里那句
`user === null || user.disabledAt !== null` 是与 cookie 路径**逐字同构**的判据，
文件头专门写了为什么不能分叉。迁移后它依然成立 —— 因为影子表里还有 `disabledAt`，
只是这一列现在由 Casdoor 同步过来。**这是保留影子表的又一个理由**：
否则每次 SDK 上报都要向 Casdoor 打一次 HTTP 去问「这人停用了没」。

---

## 4. 推荐架构

```
                 ┌───────────────────────────┐
   浏览器  ──1──▶│  Casdoor  (Go, :8000)     │  登录页 / MFA / LDAP
                 │  ├ Organization: automationstack
                 │  ├ Application:  automationstack-web
                 │  └ User (真相源: 口令、role、isForbidden)
                 └───────────┬───────────────┘
                             │ 2. OIDC code
                             ▼
                 ┌───────────────────────────┐
                 │  server (Hono, :3000)     │
                 │  /auth/callback  ← 换 token、验签、upsert 影子行
                 │  /rpc /ws /mcp /ingest    │
                 └───────────┬───────────────┘
                             │
                 ┌───────────▼───────────────┐
                 │  PostgreSQL               │
                 │  users        ← 影子表（id 不变 + casdoor_id）
                 │  project_members  ← 本地真相（不动）
                 │  api_tokens       ← 本地真相（不动）
                 └───────────────────────────┘
```

会话怎么走，有两种选择：

| | 方案 I：继续签自己的 cookie | 方案 II：直接存 Casdoor 的 JWT |
| --- | --- | --- |
| 做法 | OIDC 回调成功后，照旧调 `createSessionToken(user.id)` | 把 access_token 放进 HttpOnly cookie，每请求用应用证书验签 |
| 改动量 | **小**：`session.ts` 一行不改，只换「谁来签发」 | 中：`context.ts` 换验签实现 |
| 令牌吊销 | 仍不可单独吊销（现状如此） | 同样不可（JWT 无状态），除非开 introspect |
| 单点登出 | 要自己接 Casdoor 的 `sso-logout` webhook | 天然一些 |
| 推荐 | ✅ **先走 I** | 有 SSO 单点登出需求时再换 |

方案 I 的价值：`session.ts`、`context.ts`、`session-expiry.ts`、`use-session-gate.ts`
这四个文件加起来两百多行、注释里全是踩过的坑（跨请求的模块级状态、跳转去重、
缓存清空顺序），**一行都不用碰**。迁移的爆炸半径缩到 `routers/auth.ts` 一个文件。

---

## 5. 同步链路：Casdoor → 本地影子表

三种手段，建议**同时用前两种**：

1. **登录时 upsert（必需）**：OIDC 回调拿到用户信息后，按 `casdoor_id` upsert
   本地行，写入 `username` / `role` / `disabledAt`。这一条保证「能登录的人本地
   一定有行」，是外键完整性的地基。
2. **Webhook（推荐）**：Casdoor 的 Settings → Webhooks 支持
   `add-user` / `update-user` / `delete-user` / `set-password` / `login` 等事件，
   可配自定义请求头。用它把「管理员在 Casdoor 里停用了某人」实时推过来，
   否则本地 `disabledAt` 要等那人下次登录才更新 —— 而**他不登录正是停用要挡的情况**，
   且 API Token 那条路完全绕过登录。⚠️ Casdoor 的 webhook **没有内建签名机制**，
   得靠自定义头里放一个共享密钥来认，接收端要恒定时间比较。
3. **Database Syncer（仅用于首次导入）**：Casdoor 能直连本仓库的 Postgres，
   把 `users` 表按列映射导入。适合一次性搬账号，**不建议开成常驻双向同步** ——
   双向同步会让「谁是真相源」这个问题永远没有答案。

`删除` 的语义要在这里定死：Casdoor 里删用户 → 本地**不删行**，只置 `disabledAt`。
理由与 `schema/users.ts` 现有注释一致（用例署名是文本快照，删账号会让历史记录
看起来像是新人干的），而且删本地行会 cascade 掉 `project_members` 与 `api_tokens`。

---

## 6. 分阶段方案

### 阶段 0：只加 SSO，不动数据模型（如果动机只是「想用企业账号登录」，做到这里就停）

- 起一个 Casdoor，配 LDAP / 企业微信 / OIDC provider
- server 加一条 `/auth/oidc/callback`，回调里按 `username` 找本地用户，
  找到就调 `createSessionToken` 签发现有的 cookie
- 登录页加一个「用企业账号登录」按钮，本地口令登录**保留**

触及：`packages/api/src/routers/auth.ts`、`apps/server/src/index.ts`、
`apps/web/src/components/auth/login-form.tsx`、`packages/env/src/server.ts`。
约 200～300 行新代码，**零 schema 变更、零数据迁移、零回滚风险**。

### 阶段 1：Casdoor 成为口令的真相源

- schema：`users` 删 `password_hash`，加 `casdoor_id`（unique）
- 数据：用 Database Syncer 或 `/api/add-user` 把现有账号导入 Casdoor；
  口令按 §3.1 选方案 A 或 B
- 删除：`packages/db/src/password.ts`、`packages/api/src/lib/login-rate-limit.ts`、
  `routers/auth.ts` 里的诱饵散列与 login 过程
- `scripts/seed-admin.ts` 改成「在 Casdoor 里建第一个管理员」或直接删（Casdoor 自带 `built-in/admin`）
- `users.resetPassword` 从平台移除，改为跳 Casdoor 的改密页

### 阶段 2：账号 CRUD 移交 Casdoor 控制台

- `apps/web/src/components/platform-users/` 里的**创建 / 停用 / 重置口令**三块
  下线（约 1790 行中能删掉一半），保留「所属项目」那张表 —— 那是本地数据
- `packages/api/src/routers/users.ts` 的 `create` / `resetPassword` / `setDisabled` /
  `setRole` 四个过程改为薄代理（调 Casdoor API）或直接删除；`list` /
  `listWithProjects` 保留，继续读影子表
- ⚠️ `countActiveAdmins()` 那道「不能降级最后一个管理员」的护栏在 Casdoor 里**没有对应物**。
  要么在代理层重新实现，要么接受「管理员可能把自己锁在外面」（Casdoor 的
  `built-in/admin` 是兜底出路，比现在连数据库手改要好）

### 阶段 3（可选）：会话换成 Casdoor JWT + 单点登出

只有真的需要跨系统单点登出时才做。

---

## 7. 代价清单（迁之前要认下来的）

1. **多一个必须常驻的服务**。Casdoor 挂了 = **没人能登录**。现在的登录路径
   只依赖 Postgres，而 Postgres 挂了本来就什么都干不了；加了 Casdoor 就多一个
   同等级别的单点。生产要给它配健康检查与重启策略，`/health` 应该把它算进去。
2. **多一个数据库**（或同实例多一个库）+ 一套要备份的身份数据。灾备演练要覆盖它。
3. **本地开发与 CI 变重**。现在 `pnpm db:seed-admin` 一条命令就有账号；之后
   要么 compose 里多起一个 Casdoor（Go 服务，镜像不小），要么给测试环境保留
   一条 bypass —— 而**任何 bypass 都是一个不会有人去看的后门**，`mcp/identity.ts`
   的文件头刚为同类问题写过一整段。这条要认真设计，不要临场决定。
4. **丢掉一批自研的、写得很细的东西**：`login-rate-limit.ts` 的三道闸（针对
   PBKDF2 线程池 DoS 的具体分析）、诱饵散列防用户名枚举。Casdoor 有自己的
   限流，但阈值与取舍不是照着本项目的 KDF 成本算的 —— 需要重新验证，
   而不是默认它更好。
5. **口令必然要重置或影子迁移**（§3.1）。
6. **两处数据可能漂移**：影子表的 `username` 与用例里的署名快照。Casdoor 里
   改用户名之后，历史用例的署名不会跟着变 —— 这与现状一致（现在压根不能改
   用户名），但迁移后「改用户名」变成了一个可用操作，得想清楚要不要允许。

---

## 8. 收益清单（值不值得的另一半）

- MFA（TOTP / WebAuthn）—— 现在完全没有，自己实现是一整轮工作
- LDAP / AD / 企业微信 / 飞书登录 —— 现在完全没有
- 登录审计日志 —— 现在完全没有
- 口令策略（复杂度、有效期、历史）—— 现在只有一条 `min(8)`
- 少维护约 **900 行**安全敏感代码（`password.ts` + `login-rate-limit.ts` +
  `routers/auth.ts` + `platform-users/` 里的账号 CRUD）
- 将来接第二个内部系统时，账号是现成的

---

## 9. 需要你拍板的三件事

1. **动机是什么？** 只要 SSO/MFA → 做阶段 0，一周内能上，风险接近零。
   要「把用户管理彻底外置」→ 阶段 1+2，两到三周，且要接受 §7 的全部代价。
2. **口令怎么办？** 方案 A（全员重置，干净）还是方案 B（影子迁移，平滑但过渡期两套并存）。
3. **CI 与本地开发怎么认账号？** 起真 Casdoor，还是留 bypass？后者需要一个
   能写进文件头、经得起推敲的边界论证 —— 否则不要留。

---

## 参考

- [Casdoor 仓库](https://github.com/casdoor/casdoor) · [核心概念](https://casdoor.ai/docs/basic/core-concepts/) · [用户管理](https://casdoor.ai/docs/user/overview/)
- [Webhooks](https://casdoor.ai/docs/webhooks/overview/) · [Database Syncer](https://casdoor.ai/docs/syncer/Database/)
- [casdoor-nodejs-sdk](https://github.com/casdoor/casdoor-nodejs-sdk)
- 源码核对点：`cred/manager.go`（八种 passwordType）、`cred/pbkdf2_django.go`（盐的解释）、`object/check.go:264-288`（校验与自动重散列）、`object/user.go:59-70`（User 结构）
