# 第二期：测试评审和执行（手工测试闭环）实施计划

> 状态：**Block A 设计定稿，开工中**。Block B（自动化结果接入）待 Block A 完成后重新讨论。
> 前置：第一期见 `docs/phase1-testcase-platform-plan.md`（本文件不修改它）。
> 角色分工沿用第一期：主 agent 只做 计划 → 派发 → review，全部编码由子 agent 完成。

---

## 0. 本期范围

第一期交付了 `项目 → 模块树 → 用例（+版本/脑图/AI/协作/MCP）`。
本期在其上加**测试评审和执行**：把用例从「写完」推到「评审完 → 测完 → 有结果」。

菜单位置：`项目 › 用例 │ 脑图 │ 【测试评审和执行】`

**不在本期**：自动化结果接入（SDK/Ingest）、设备托管、截图对比。

---

## 1. 已拍板决策

| # | 议题 | 结论 |
|---|---|---|
| D1 | 实体数量 | **一个实体：测试任务**。不拆评审单/计划/轮次三层 |
| D2 | 用例版本 | **不锁版本快照**。用例永远只有一份，活引用，改动实时同步 |
| D3 | 用例状态 | **测试任务完全不写 `test_cases` 表**。建多少测试任务都不影响用例库 |
| D4 | 评审过程 | **线下开会**，平台只记状态流转与操作人，不做逐条 verdict/评论 |
| D5 | 结论类型 | **通过 / 失败 / 阻塞 / 跳过**（四种） |
| D6 | 状态机 | 加「测试中」，**自动流转** |
| D7 | 缺陷 | Jira：正向创建 + 反向关联 + webhook 状态同步 |
| D8 | Jira 认证 | **项目级 API Token**（站点 URL + 邮箱 + token，密文存储） |
| D9 | **Jira 未配置** | **必须优雅降级**，缺陷字段退化为纯文本 URL 输入，不影响任何流程 |
| D10 | 附件存储 | **Cloudflare R2**（S3 兼容），预签名直传 + **短期签名 GET URL** |
| D11 | 回归重测 | 不做轮次。新建测试任务，提供「从 XX 任务的失败用例创建」快捷入口 |
| D12 | 已完成的测试任务改结论 | **直接改，无阻力**，自动退回「测试中」。不加确认框、不设「重新打开」按钮 |
| D13 | 追加用例 | **任意状态随时可加**，无限制、无额外提示。见 §2.4 |
| D14 | 状态流转留痕 | `test_run_events` 表 insert-only 记录全部流转。**用途是审计，不是保护报告**——报告永远实时正确 |
| D15 | **报告权威性** | 加终态 `submitted`。已完成 → 展示报告 → 用户点「提交报告」→ **这个测试任务锁死，一切不可改** |
| D16 | 超时自动提交 | 完成后超过 N 天未手动提交则自动提交。`submittedBy IS NULL` 即自动提交，不加 boolean 列 |
| D17 | **N 天可配置** | N 是**项目级配置**，默认 3，范围 1–30。配置入口在一级侧边栏最后的「设置」 |

---

## 2. 流程与状态机

```
新建测试任务（勾选用例）
      │
      ▼
  ┌─────────┐  线下开会评审完，人工推进   ┌────────┐
  │ 待评审   │ ─────────────────────────> │ 待测试  │
  │pending_ │ <───────────────────────── │ ready  │
  │ review  │   仅当零条结论时可撤销      └───┬────┘
  └─────────┘                                │ 打第一条结论（自动）
                                             ▼
                                       ┌───────────┐  全部有结论（自动）  ┌──────────┐
                                       │  测试中    │ ──────────────────> │ 已完成    │
                                       │in_progress│ <────────────────── │completed │
                                       └───────────┘  出现 untested（自动）└──────────┘
```

结论：`untested → passed | failed | blocked | skipped`

### 2.1 流转规则

| 流转 | 触发 | 说明 |
|---|---|---|
| `pending_review → ready` | 人工点「评审完成」 | 记 `reviewedBy` / `reviewedAt` |
| `ready → pending_review` | 人工撤销 | **仅当该测试任务零条结论时允许**。打了第一条就不能退——退回去意味着评审阶段能增删用例，而已经有人在测了 |
| `ready → in_progress` | 打第一条结论 | 自动，写 `startedAt` |
| `in_progress → completed` | 已无 `untested` 行 | 自动，写 `completedAt` |
| `completed → in_progress` | **出现 `untested` 行** | 自动，`completedAt` 置 null。触发源有二：回退某条结论、追加新用例 |
| `in_progress → ready` | **不提供** | `startedAt` 已记录曾经开测的事实，退回去会把它抹掉。`in_progress` 完全能容纳「测了又全撤了」 |
| `completed → submitted` | 人工点「提交报告」 | 写 `submittedAt` + `submittedBy`。**终态，不可逆** |
| `completed → submitted` | 超时自动 | `completedAt < now() - N days` 时写 `submittedAt`，`submittedBy` 留 null |
| `submitted → *` | **不提供** | 无任何解锁路径。要继续测就新建测试任务（D11 的「从失败用例创建」正好接这个场景） |

### 2.2 开测之后，状态不再限制操作（D12 / D13）

一旦进入 `in_progress`，`in_progress` 与 `completed` 的**可操作权限完全相同**（`submitted` 除外，见 §2.5）：
改结论、回退结论、追加用例都允许，无二次确认、无「重新打开」按钮、无额外提示。
任何产生 `untested` 行的操作都会把 `completed` 自动拉回 `in_progress`。

### 2.3 报告永远是实时正确的，不需要任何保护机制

报告是对当前数据的实时查询，不是完成时刻的快照。追加 3 条用例 → 总数变 123 →
测试任务自动退回「测试中」→ 报告如实显示 `120/123`；测完后任务再次完成 → 报告如实显示
123 条的通过率。**任何时刻报告都自洽且准确。**

因此**不做**：报告快照、追加条数披露、重开次数披露、修改前的确认拦截。
唯一会「对不上」的是有人在 T1 截图了报告、T2 再看数字变了——那是任何实时看板的通性，
与本功能无关，不该由测试任务来背。

`test_run_events` 的用途由此重新定位：**审计**（谁把测试任务推到「待测试」的、
这个任务是否反复返工），而非保护报告。展示位置是详情页的「变更历史」折叠区，
**不在报告页**。

### 2.5 提交之后锁死（D15 / D16 / D17）

§2.3 说的是「报告任何时刻都自洽」，但**自洽不等于有权威性**——数字随时会变，
就没法拿它去对外结论。所以在「完成」和「权威」之间加一道人为闸门：

```
completed ──人工点「提交报告」──> submitted（终态）
    └──── 完成满 N 天未提交，自动提交 ────┘
```

- `submitted` 之后**全部写操作拒绝**：改结论、追加用例、传附件、改缺陷 URL，全部返回冲突错误
- **唯一例外**：Jira 的 `defectStatus` 由 webhook 继续同步。它是外部客观事实（issue 关没关），
  不是这个测试任务的测试结论，冻结它只会让报告显示过期信息
- **手动 vs 自动的唯一区分是 `submittedBy IS NULL`**，不加 `autoSubmitted` boolean 列
- 报告页在 `completed` 阶段顶部显示「本报告尚未提交，数据仍可变动 · 将于 X 月 X 日自动提交」，
  提交后替换为「已于 XXX 由 XXX 提交 / 系统自动提交」
- **提交是幂等的**：并发提交靠 `UPDATE ... WHERE submitted_at IS NULL` 保证只有一次生效

因为提交后数据不可变，**实时查询与快照永远等价**，所以**依然不需要报告快照表**——
§2.3 的结论不变，D15 只是给它加了个截止时间。

#### 自动提交的实现

不引入定时任务框架。判定谓词：

```sql
status = 'completed' AND submitted_at IS NULL
  AND completed_at < now() - (COALESCE(ps.auto_submit_after_completed_days, 3) || ' days')::interval
```

在读路径（列表 / 详情 / 报告）进入时惰性结算命中的测试任务，顺带写一条 `test_run_events`。
惰性结算的代价是没人访问就不会翻状态，但由于**报告页本身就是访问点**，
用户看到的永远是已结算的状态，无感知差异。

- **回退到「未测」会清空该行的一切执行痕迹**：`executedAt` / `executedBy` /
  `caseVersion` / `comment` 全清。回退的语义是「我刚才标错了」，标错的结论
  不该留下它的理由——一条标着「未测」却挂着「支付超时」的行会被当成活结论读。
  想留说明待会儿重测的场景，出口是 `blocked` 而不是回退
- **空测试任务（0 条用例）在创建时就被拒绝**。它既到不了 `in_progress`（没有首条结论）
  也到不了 `completed`，是个死胡同状态。前端禁用按钮 + 服务端校验都要有，
  因为创建入口将来可能来自 MCP 或脚本
- **已提交的测试任务不可删除**。冻结编辑却放行删除是自相矛盾的——删掉整份报告比改一个数字
  破坏性更大，想抹掉不利结论的人会直接删掉重开。代价是建错又超时自动提交的任务会攒在列表里，
  那是**杂乱**不是**数据损坏**；真要清理，正确的出口是将来加「归档」（默认列表隐藏、
  报告仍可访问），不是删除

### 2.4 关键语义

- **已完成 ≠ 全部通过**。已完成只表示「都测完了」。报告页必须醒目区分
- **阻塞/跳过是逃生口**。环境挂了、依赖没好的用例必须能标记，否则测试任务永远关不掉，
  最后大家会乱打「通过」把它糊过去，数据就废了
- **完成率 ≠ 通过率**：
  - `完成率 = 有结论 / 总数`（四种结论都算）
  - `通过率 = 通过 / (通过 + 失败)` ← **阻塞与跳过踢出分母**

---

## 3. 数据模型

主键统一 `uuid defaultRandom`；新文件从 `packages/db/src/schema/index.ts` re-export；
迁移走 `db:generate` / `db:migrate`。
**所有 SQL 与事务只能写在 `packages/db/src/repositories/`**（沿用第一期架构修订）。
字段在对象字面量里**按字母序**排列（沿用现有 schema 文件风格）。

### 3.1 `schema/test-runs.ts`

```ts
pgEnum test_run_status        : pending_review | ready | in_progress | completed
pgEnum test_run_case_result   : untested | passed | failed | blocked | skipped
pgEnum test_run_attachment_kind : screenshot | video | log | other

test_runs
  completedAt   timestamptz null
  createdAt     timestamptz notNull defaultNow
  createdBy     uuid → users.id  onDelete set null
  description   text null
  id            uuid pk defaultRandom
  name          text notNull
  projectId     uuid notNull → projects.id  onDelete cascade
  reviewedAt    timestamptz null          -- 推进到「待测试」的时刻
  reviewedBy    uuid → users.id  set null -- 谁推进的，留痕
  startedAt     timestamptz null          -- 首条结论时刻
  status        test_run_status notNull default 'pending_review'
  updatedAt     timestamptz notNull $onUpdate
  index (projectId, status)
  index (projectId, createdAt desc)

test_run_cases                 -- 范围与结果合一：一条用例在一个测试任务里只出现一次
  assigneeId    uuid → users.id  set null
  caseId        uuid notNull → test_cases.id  onDelete RESTRICT   ← 见 §3.4
  caseVersion   integer null    -- 打结论那一刻的 test_cases.currentVersion，见 §3.3
  comment       text null       -- 失败原因 / 阻塞原因
  createdAt     timestamptz notNull defaultNow
  defectKey     text null       -- "PAY-123"
  defectStatus  text null       -- Jira 状态快照，webhook 更新
  defectTitle   text null
  defectUrl     text null       -- 未配置 Jira 时，这里存用户手填的纯文本 URL
  executedAt    timestamptz null
  executedBy    uuid → users.id  set null
  id            uuid pk defaultRandom
  result        test_run_case_result notNull default 'untested'
  runId         uuid notNull → test_runs.id  onDelete cascade
  sortOrder     integer notNull default 0
  UNIQUE (runId, caseId)
  index (runId, result)
  index (caseId, executedAt desc)     -- 用例详情页看跨测试任务的执行历史

test_run_attachments
  contentType   text notNull
  createdAt     timestamptz notNull defaultNow
  createdBy     uuid → users.id  set null
  id            uuid pk defaultRandom
  kind          test_run_attachment_kind notNull default 'screenshot'
  runCaseId     uuid notNull → test_run_cases.id  onDelete cascade
  sizeBytes     integer notNull
  storageKey    text notNull    -- R2 object key，不存完整 URL（URL 是签出来的）
  index (runCaseId)
```

### 3.2 `schema/integrations.ts`

```ts
jira_configs                   -- 项目级，一个项目至多一行
  apiTokenCipher  text notNull  -- secret-box.ts 的 encryptSecret 密文，绝不明文
  createdAt       timestamptz notNull defaultNow
  defaultIssueType text notNull default 'Bug'
  email           text notNull  -- Jira 账号邮箱，API Token 认证需要
  id              uuid pk defaultRandom
  projectId       uuid notNull UNIQUE → projects.id  onDelete cascade
  projectKey      text notNull  -- Jira 侧 project key，如 "PAY"
  siteUrl         text notNull  -- https://xxx.atlassian.net
  updatedAt       timestamptz notNull $onUpdate
  updatedBy       uuid → users.id  set null
  webhookSecret   text null      -- 状态同步 webhook 校验
```

**未配置 = 该项目没有 `jira_configs` 行。** 所有 Jira 能力据此优雅降级（D9）。

### 3.3 `schema/project-settings.ts`

```ts
project_settings               -- 项目级，一个项目至多一行；懒创建
  autoSubmitAfterCompletedDays integer notNull default 3   -- CHECK (>= 1 AND <= 30)
  createdAt                    timestamptz notNull defaultNow
  id                           uuid pk defaultRandom
  projectId                    uuid notNull UNIQUE → projects.id  onDelete cascade
  updatedAt                    timestamptz notNull $onUpdate
```

**懒创建**：建项目时不插默认行。没配过 = 没有行，读取方一律
`COALESCE(ps.auto_submit_after_completed_days, DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS)`。
好处是默认值改了对所有没显式配置的项目立即生效，不用回填。

**为什么不和 `jira_configs` 合表**：jira 带密文、有独立的连通性校验与生命周期
（可以随时断开重连），project_settings 是纯标量偏好。合表会让「删 Jira 配置」
变成「把一堆列置 null」，语义变脏。UI 上两者同属一个「项目设置」页，存储分开。

### 3.4 `caseVersion` 的用途

**这不是锁版本**。UI 上没有任何版本选择控件，用例永远展示最新版（D2）。
它只是在打结论那一刻顺手记下 `test_cases.currentVersion`。

代价一个 int 列、零 UI。收益：三个月后有人问「这条 8 月 12 号为什么失败，我现在看用例根本没这个步骤」，
能一秒答出当时执行的是 v3、现在是 v7，并用第一期已有的 `case_versions` 做 diff。
没有这个字段，这个问题永远无解——有历史但不知道该对哪一版。

### 3.5 用例删除策略

`test_run_cases.caseId` 用 **`onDelete: RESTRICT`**。

理由：若用 cascade，删一条用例会让所有历史测试任务里对应的结果行**静默消失**，
已完成测试任务的统计数字会自己变化，报告不可复现。

配套：repository 层删除用例前先查引用数，命中则返回类型化结果，
router 映射为友好错误——「该用例被 N 个测试任务引用，无法删除；可改为『废弃』状态」。
`test_cases.status` 本来就有 `deprecated`，那才是正确的软删除出口。

---

## 4. API（packages/api/src/routers/testRuns.ts）

全部走 `protectedProcedure`（本期无匿名入口）。

```
list            (projectId, status?, kw?) → 测试任务列表 + 每个任务的进度统计
get             (runId)                   → 测试任务详情 + 用例清单（join 活的 test_cases）
create          (projectId, name, description?, caseIds[])
update          (runId, name?, description?)
remove          (runId)
addCases        (runId, caseIds[])                    -- 任意状态；completed 会被自动拉回 in_progress
removeCases     (runId, runCaseIds[])
assign          (runCaseIds[], assigneeId)
markReviewed    (runId)                               -- pending_review → ready，记 reviewedBy/At
unmarkReviewed  (runId)                               -- ready → pending_review，仅当零条结论
listEvents      (runId)                               -- 状态流转历史，报告页披露用
setResult       (runCaseId, result, comment?, defect?)
bulkSetResult   (runCaseIds[], result)                -- 「一键全部通过」走这个
createFromFailed(sourceRunId, name)                   -- D11 重测任务快捷入口
report          (runId)                               -- 报告页聚合数据
submit          (runId)                               -- completed → submitted，终态锁死

projectSettings.get    (projectId)                    -- 无行时返回默认值
projectSettings.update (projectId, autoSubmitAfterCompletedDays)  -- upsert
```

### 4.1 自动流转（在 repository 的同一事务内完成，不靠应用层补偿）

**任何改变 `test_run_cases.result` 或增删 run_case 的操作，末尾都要跑同一段状态推导。**

```
① SELECT ... FROM test_runs WHERE id = ? FOR UPDATE     ← 必须先锁行
② 在同一事务内重新统计 test_run_cases 的 untested 计数
③ 推导目标状态：
     untested 计数 = 0  且 status ∈ {in_progress}          → completed，写 completedAt
     untested 计数 > 0  且 status = 'completed'            → in_progress，completedAt = null
     status = 'ready' 且本次产生了首条结论                  → in_progress，写 startedAt
④ 状态真的变了才 INSERT test_run_events(fromStatus, toStatus, actorId)
```

**`FOR UPDATE` 不是可选的。** 竞态场景：小张打最后一条（想置 completed），
小李同时把另一条回退成 untested（想置 in_progress）。不锁行的话两个事务各自统计、
各自得出矛盾结论，谁后提交谁赢，测试任务的状态会跟实际结果对不上。
「两人同时打最后两条」则靠 `UPDATE ... WHERE status <> 'completed'` 幂等兜底，更新 0 行无害。

**禁止**在 router / 应用层「先查再改」实现这段推导。

### 4.2 `submitted` 守卫与惰性自动提交

所有写操作（`setResult` / `bulkSetResult` / `addCases` / `removeCases` / `assign` /
附件上传 / 缺陷字段编辑）在 §4.1 那段 `FOR UPDATE` 之后**第一件事**就是检查
`submittedAt IS NOT NULL`，命中直接返回类型化冲突结果，router 映射成
「该测试任务已提交并锁定，不可修改」。**不要在 router 里先查一次再调 repository**——
那是 TOCTOU，中间别人可能刚好提交了。

`submit` 自身走 `UPDATE test_runs SET submitted_at = now(), submitted_by = ?
WHERE id = ? AND submitted_at IS NULL AND status = 'completed'`，
更新 0 行说明已提交或未完成，返回对应类型化结果，不抛异常。

自动提交在 `list` / `get` / `report` 的读路径入口惰性结算（见 §2.5），
`submittedBy` 写 null，同样只用一条带 `submitted_at IS NULL` 条件的 UPDATE 保证幂等。

### 4.3 实时同步

- `realtime/protocol.ts` 的 `invalidateEntitySchema` 增加 `"testRun"`
- 所有 mutation 成功后经现有 `lib/realtime-publish.ts` 发 invalidate
- **用例改动的实时同步是白送的**：`test_run_cases` 只存 `caseId`，详情页实时 join
  `test_cases`；用例被改时第一期已有的 `case` invalidate 事件会让测试任务详情页自动刷新。
  这块**不需要写任何新代码**

---

## 5. Jira 集成（packages/api + apps/server）

### 5.1 优雅降级（D9，硬性验收点）

> 未配置 Jira 的项目，测试任务的**全部功能必须可用**，不得报错、不得出现禁用态以外的异常。

| 能力 | 已配置 | 未配置 |
|---|---|---|
| 缺陷字段 | 「创建 Jira Issue」按钮 + 已关联 issue 卡片（带状态） | 一个纯文本 URL 输入框，存进 `defectUrl` |
| 反向关联 | 粘贴链接 → 拉标题/状态回填 | 只存 URL 原文，不发任何外部请求 |
| 状态同步 | webhook 更新 `defectStatus` | 无 |
| 重测任务 | 「从已修复的失败用例创建」 | 「从失败用例创建」（不带修复状态过滤） |

实现约束：Jira 能力全部经一个 `getJiraClient(projectId)` 入口，
返回 `null` 即视为未配置；**调用方必须处理 null 分支**，禁止抛异常当控制流。

### 5.2 三个方向

- **正向创建**：失败结论 → 建 issue。标题 = 用例名，描述 = 用例步骤 + 实际结果 + 平台回链，
  截图作为**真实附件上传到 Jira**（不要在描述里引用 R2 外链——签名会过期，Jira 里的图挂掉比没有更糟）。
  返回的 issue key/url/title 写回 `test_run_cases`
- **反向关联**：粘贴已有 issue 链接 → 解析 key → 拉标题与状态回填
- **状态同步**：Jira Cloud webhook → `POST /api/jira/webhook`（`webhookSecret` 校验）→
  更新对应 `defectStatus`。轮询作为兜底

### 5.3 为什么状态同步是核心

它回答那个每天要问的问题：**「哪些失败的 bug 已经修好了，可以开重测任务了？」**
没有它，测试同学每天去 Jira 一条条翻。有了它，D11 的重测任务入口才能进化成
「从**已修复**的失败用例创建重测任务」——流程闭环真正合上的地方。

---

### 5.1 Jira issue 里不写 R2 链接

失败用例创建 issue 时，description **只写附件数量 + 一条回平台的链接**，
不写 R2 签名 URL——签名 15 分钟过期，写进 issue 第二天就是死图，
dev 点开打不开会以为是我们的平台坏了，比不写更糟。

真正的答案是把截图作为**真实 Jira 附件**上传
（`POST /rest/api/3/issue/{key}/attachments` + `X-Atlassian-Token: no-check`），
字节从 R2 取、经服务端转发。**本期不做**：字节要过应用服务器，正好抵掉
R2 预签名直传的设计目的，录屏 20MB 的量级尤其难受。将来做的话**限定图片类附件**
（截图小，且正是 dev 最需要的那个），录屏和日志仍只给回平台的链接。

### 5.2 webhook 双校验，且不许回落

同时支持 `X-Hub-Signature: sha256=<hex>`（HMAC）与共享密钥头 `X-Webhook-Secret`
——Jira 两种配置方式都存在，只留一条会让一半用户配不通。

**带了签名头但前缀不对时，必须直接拒绝，不许回落到共享密钥比对。**
那是经典的降级攻击面：攻击者发一个格式不对的签名头，就能把校验挤到弱的那条路上。
测试名里要写明「不回落」，否则后来者会当成可以顺手简化掉的分支。

### 5.3 `webhookPath` 只给路径不给完整 URL

服务端不知道自己被反代到了哪个域名（`CORS_ORIGIN` 是前端地址，不是自己的），
拼出来的完整 URL 多半是错的，给个错 URL 比给个路径更坑人。
**由前端拼 origin**——这条写进 W8 设置页的任务卡。

---

## 6. R2 附件

R2 是 S3 兼容，用 `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`，只换 endpoint 与 credentials。

- **上传**：`attachments.presign` 返回预签名 PUT URL，前端直传，**不过应用服务器**
  （录屏体积会失控）；成功后调 `attachments.register` 登记元数据
- **访问**：短期签名 GET URL（**15 分钟**）。测试截图常含测试环境真实业务数据，
  不用 public bucket
- env 新增：`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET`
  （**全部 optional**，未配置时附件上传按钮禁用并提示，同样不影响主流程）
- 限制：单文件 ≤ 20MB，类型白名单 `image/png|jpeg|webp`、`video/mp4|webm`、`text/plain`

### 6.1 object key 规则

`test-runs/{projectId}/{runId}/{runCaseId}/{kind}-{uuid}.{ext}`

- **原始文件名一个字符都不进 key**：路径穿越，以及中文/特殊字符进签名会炸
- `ext` 从**已过白名单的 contentType** 查表反查，不从用户文件名取
- 三层 id 前缀是孤儿对象的清理入口（见 §6.3）
- 原始文件名存在 `test_run_attachments.fileName` 列里，**纯展示用**，
  绝不参与 key 生成、绝不进任何路径或 URL 拼接。日志/录屏类附件没有缩略图，
  没有这一列用户在列表里只能看到 `log-<uuid>.txt`，认不出是哪一份

### 6.2 上限靠 HeadObject 兜，不靠签名

`presignUpload` 阶段的 `sizeBytes` / `contentType` 只是**预检**——早点告诉用户「文件太大」，
比传完再说体验好。但**签名一旦发出就管不住了**，客户端完全可以传 5GB。

补法不是把 content-length 绑进 SignedHeaders（无法对真实 R2 验证是否接受，
赌错的后果是上传整体挂掉），而是 **`register` 时先 `HeadObject` 拿对象的客观真值**：

- 对象不存在 → 拒绝（顺带堵住「presign 完不传就直接 register」造出的幽灵行）
- 真实 size 超上限，或真实 contentType 不在该 kind 白名单里 → **先删对象**再拒绝
- **落库一律以 HeadObject 的返回值为准**，不采信前端传的 `sizeBytes` / `contentType`

比绑 content-length 更强：那个只约束单次 PUT 的声明值，HeadObject 校的是 bucket 里的事实。
代价是每次 register 多一次 R2 往返——发生在用户点完「上传」之后，无所谓。

**contentType 必须绑进签名**（`signableHeaders`）：`S3RequestPresigner` 默认把 content-type
放进 unsignableHeaders，只在命令里写 `ContentType` 等于白名单形同虚设。
**代价是前端契约变硬——PUT 时必须带完全相同的 `Content-Type`，否则 R2 返 403
`SignatureDoesNotMatch`**。这条要写进 W6 的任务卡。

### 6.3 孤儿对象是两阶段方案的固有代价

「presign → 前端直传 → register」必然产生签了名、传了、但没 register 的对象。
这是该方案的代价，**接受，不为此引入定时任务**。key 的三层 id 前缀使得将来可以按前缀
`ListObjectsV2` 与 `storage_key` 做差集、删掉超过一天的孤儿。

删除顺序固定为**先删库、后删对象**——反过来会在报告页上留下清不掉的死图。

### 6.4 附件不单独占实时 topic

`register` / `remove` 成功后（事务已提交）发 `publishInvalidate`，
`entity: "testRun"`、`ids: [runId]`。附件是测试任务详情的一部分，
前端 invalidate 掉整个 run 详情查询即可；多一个 topic 只会让 `map-invalidate.ts` 多一处要维护。

---

## 7. 前端（apps/web）

路由挂在既有工作区布局下：`projects/$projectId/test-runs/`

### 7.1 列表页 `test-runs/index.tsx`
表格：任务名 / 状态徽标 / **进度条 `34/120`** / 通过率 / 负责人 / 创建时间。
按状态筛选。右上「新建测试任务」。

### 7.2 新建 / 编辑
名称 + 描述 + **用例选择器**（复用第一期模块树 + 用例列表 + 筛选，多选）。
额外入口：「从 XX 任务的失败用例创建」（D11）。

### 7.3 详情页（执行台）`test-runs/$runId.tsx`
```
┌────────────────┬──────────────────────────────────────┐
│ 用例清单        │  用例内容（实时 join，永远最新）        │
│ ○ 未测 86       │  前置条件 / 步骤 / 预期                │
│ ● 通过 30       │                                      │
│ ✕ 失败  3       │  结论: (•)通过 ( )失败 ( )阻塞 ( )跳过 │
│ ⊘ 阻塞  1       │  说明: [__________________________]  │
│                │  截图: [粘贴/拖拽上传 → R2]           │
│ 筛选 模块▾ 人▾  │  缺陷: [创建 Jira Issue] 或 [URL 输入] │
│ [全选] [一键通过]│                                      │
└────────────────┴──────────────────────────────────────┘
        快捷键 P=通过 F=失败 B=阻塞 S=跳过 → 自动跳下一条
```
- 待评审状态：可增删用例，不可打结论
- 已完成状态：**不是只读**，与测试中权限完全相同（§2.2）
- **已提交状态：全只读**，所有输入控件禁用，顶部横幅说明锁定时间与提交人
- 复用第一期 realtime：谁在看哪条实时可见
- 底部「变更历史」折叠区：读 `test_run_events`，展示状态流转与操作人（审计用）

### 7.4 报告页 `test-runs/$runId/report.tsx`

**从「测试中」就开放**，不是等已完成才给看——完成率在已完成时恒为 100%，
真正需要看图的时刻是测试中（今天测了多少、P0 有没有挂、谁的任务压着没动）。

1. **四个大数字**：总用例 / 通过 / 失败 / 阻塞+跳过
2. **两个率**：完成率、通过率（口径见 §2，必须分开展示）
3. **三张图**：结果分布环形图 / 按模块的通过失败横向柱状（哪个模块最烂）/
   按优先级通过率（**P0 有没有失败 = 上线红线**）
4. **失败用例清单表**（报告页真正要交出去的东西）：
   `用例名 │ 模块 │ 优先级 │ 执行人 │ 失败原因 │ 截图 │ Jira │ Jira状态`

**顶部提交条**（D15）：
- `in_progress`：不显示
- `completed` 未提交：黄条「本报告尚未提交，数据仍可变动 · 将于 {date} 自动提交」+「提交报告」按钮（二次确认，文案强调不可逆）
- `submitted`：灰条「已于 {time} 由 {user} 提交，报告已锁定」；自动提交时显示「由系统自动提交」

### 7.5 设置页 `routes/settings.tsx`

**一级侧边栏最后一项「设置」**（D17），排在「AI 配置」之后。

一级侧边栏是**全局作用域**的（`/projects`、`/members`、`/ai-provider`，
`ai_provider_config` 甚至是个 id 固定的单例表），而本期两项配置都是**项目级**的。
按用户指定的位置放，代价是页面顶部必须有项目选择器：

```
设置
┌──────────────────────────────────────────┐
│ 项目  [ 支付中心 ▾ ]                       │  ← URL 同步 ?projectId=xxx，可深链
├──────────────────────────────────────────┤
│ 测试任务                                   │
│   自动提交等待天数  [ 3 ]  天               │
│   测试任务完成后超过该天数仍未手动提交，      │
│   将自动提交并锁定。范围 1–30。             │
│                              [保存]        │
├──────────────────────────────────────────┤
│ Jira 集成                                 │
│   站点 URL / 邮箱 / API Token /            │
│   project key / 默认 issue 类型            │
│                    [测试连接]  [保存]       │
└──────────────────────────────────────────┘
```

- 项目选择器默认选中最近访问的项目，选择写进 URL query，刷新与分享保持
- 两个分区**分别保存、互不阻塞**（对应两张独立的表，见 §3.3）
- API Token 已配置时输入框显示掩码占位，**留空提交表示不修改**，不要用占位串回写
- 未配置 Jira 时页面正常展示空表单，不影响任何其它功能（D9）
- 后续若有更多项目级配置，这一页直接加分区；如果将来项目级配置多到喧宾夺主，
  再考虑在项目工作区内开二级入口，本期不做

---

## 8. 任务包与依赖

```
W1  Schema + 迁移 + repository 骨架                    ← 串行前置，主 agent 逐字 review
     schema/test-runs.ts + schema/integrations.ts
     + invalidateEntitySchema 加 "testRun"
     + 用例删除引用检查（§3.4）
              │
   ┌──────────┼──────────────┬──────────────┐
  W2 测试任务 API  W3 R2 附件    W4 Jira 集成
   (repository     (presign +    (配置 CRUD + 正向/反向/
    + router +      register +    webhook + 优雅降级)
    自动流转)        签名 GET)
              │
   ┌──────────┼──────────────┬──────────────┐
  W5 前端·列表  W6 前端·详情   W7 前端·报告   W8 前端·设置页
     +新建       执行台          图表+提交条     侧边栏「设置」入口
                                              + 测试任务设置 + Jira 配置
                                              + 缺陷关联 UI
```

W5/W6 任务卡必须包含：`apps/web/src/realtime/map-invalidate.ts` 现在是
`testRun: []` 占位，需补 `InvalidateTarget` / `ALL_INVALIDATE_TARGETS` /
`TARGET_KEYS` / `ENTITY_TARGETS` 四处，否则 mutation 发出的事件刷新不了任何东西。

**W1 是全局瓶颈**，完成并 review 通过后 W2/W3/W4 才能并行开工。

---

## 9. 验收要点

- [ ] Jira 未配置的项目，测试任务全流程可用，无异常、无报错（D9）
- [ ] R2 未配置时，除附件上传禁用外主流程可用
- [ ] 已完成的测试任务回退某条结论 → 任务自动退回「测试中」，`completedAt` 置 null，记 event
- [ ] 已完成的测试任务追加用例 → 同样自动退回「测试中」
- [ ] `ready` 状态零条结论时可撤销回「待评审」；打了一条后撤销被拒绝
- [ ] `in_progress` **不会**退回 `ready`
- [ ] 状态推导在**同一事务**内且对 `test_runs` 行加了 `FOR UPDATE`；并发打最后一条不产生矛盾状态
- [ ] 追加用例在任意状态下都可用，无额外提示与拦截
- [ ] 报告页**没有**任何快照/披露机制，全部指标为实时查询
- [ ] 通过率分母不含阻塞与跳过
- [ ] 删除被测试任务引用的用例被拦截，提示改用「废弃」
- [ ] 测试任务详情页在用例被别人改动时自动刷新（realtime，零新代码）
- [ ] `submitted` 测试任务的所有写操作被拒绝，且拒绝发生在 repository 事务内（非 router 预检）
- [ ] 重复提交同一个测试任务不报错，第二次返回「已提交」而非异常
- [ ] 自动提交天数改为 1 后，完成满 1 天的测试任务在下次访问列表/报告时自动结算为已提交
- [ ] 未配置过设置的项目，自动提交按默认 3 天生效（`project_settings` 无行）
- [ ] 自动提交的测试任务 `submittedBy IS NULL`，报告页显示「系统自动提交」
- [ ] `submitted` 测试任务的 Jira `defectStatus` 仍能被 webhook 更新（§2.5 唯一例外）
- [ ] `pnpm check-types` + `pnpm dlx ultracite check` 全绿

---

## 10. Block B：自动化结果接入（**待重新讨论**）

原方案（SDK / Ingest REST / automation_* 三表 / 两套报表）**暂缓**。
Block A 完成后重新讨论，重点是：自动化结果要不要、以及如何与测试任务发生关系
（例如「测试任务里的用例能否由自动化打结论」），这个问题依赖 Block A 的最终形态。

已确定不变的前提：
- 平台不集成 WebdriverIO，出 SDK 让用户在自己项目里写，结果回传（BrowserStack 模式）
- `test_cases.sourceRef` 是自动化脚本与平台用例的锚点
- 先上报型，后托管；设备平台在更后面的期次
