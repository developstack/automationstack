# 第三期：自动化结果接入（SDK 上报）

> 状态：**设计定稿，待开工**。
> 前置：第一期 `docs/phase1-testcase-platform-plan.md`、第二期 `docs/phase2-testmanagement-automation-plan.md`（本文件都不修改）。
> 本期即第二期 §10 挂起的 Block B。原方案（automation_* 三表 / 两套报表 / 项目级机器身份）**已作废**，
> 作废理由见 §3.5 与 §4.1，不要回头去参考它。
> 角色分工沿用前两期：主 agent 只做 计划 → 派发 → review，全部编码由子 agent 完成。

---

## 0. 本期范围

一句话：**平台不跑测试，平台收报告。**

QA 在自己机器上跑脚本，SDK 把结果写进**第二期已经存在的那个测试任务**里——
不是写进一套自动化专属的表，也不是产出第二份报表。手工点的和脚本跑的落在同一张表、
汇进同一份报告，因为它们本来就是同一个迭代的同一次测试。

**不在本期**：调度、runner 托管、设备平台、截图对比、跨测试任务的自动化趋势曲线。

---

## 1. 已拍板决策

编号接第二期的 D17。

| # | 议题 | 结论 |
|---|---|---|
| D18 | 自动化与测试任务的关系 | **复用**。结果直接写 `test_run_cases`，不新建自动化专属实体，不出第二份报表 |
| D19 | 用例要不要标「手工 / 自动化」 | **不加这个字段**。理由见 §3.5 |
| D20 | 机器身份 | **个人 API Token**，不是项目级机器身份。`executedBy` 记真人 |
| D21 | 「这条是脚本报的」怎么表达 | 显式列 `executedVia`。**禁止**用 `executedBy IS NULL` 表达 |
| D22 | SDK 的写路径 | **必须走 `bulkSetRunCaseResult`**，不许另开一条 insert。见 §5.4 |
| D23 | 脚本能否覆盖人工结论 | **策略参数化**：`overwriteManual`，默认 `false`。平台不内建裁决 |
| D24 | 上报了不在任务范围内的用例 | **拒绝并列出**，UI 给「一键追加」。不自动追加 |
| D25 | 代码版本出处 | 薄表 `automation_executions`，记 branch / commit / CI 链接 |
| D26 | 报告口径 | **头条数字不分栏**。通过率、完成率的算法一个字不改 |
| D27 | SDK 语言 | Node.js / Java / Python 三种，**契约先于任何一个 SDK 定稿** |
| D28 | 附件上传 | 预签名 PUT。三个 SDK 都只需要 HTTP 客户端，不引 S3 SDK |
| D29 | 上报粒度 | **批量**。一次执行攒完一起提交，不逐条 |
| D30 | 已提交的测试任务 | SDK 上报被拒，且 SDK 必须**显式报错**，不许静默成功 |
| D31 | SDK 配置内容 | **只有 token + projectId**。`runId`、槽位、环境之类的每迭代参数一律不出现 |
| D32 | 归属怎么解析 | **按用例自动定位**：候选 = 该项目下所有未提交任务中包含这条用例的行。不新增任何「上报目标」表 |
| D33 | 候选 ≥ 2 | **全写，不是错误**。结论是关于用例的事实，与几个任务在关心它无关。见 §3.7 |
| D34 | 扩散的可见性 | 对账单里 `writtenTo` **按任务分组**列出。可选 `runIds` 白名单显式收窄 |
| D35 | 候选 = 0 | 列进 `outOfScope`。不自动建任务、不做暂存区 |
| D36 | 选出候选任务之前 | 先跑一次自动提交结算。补回第二期「写入方先结算」的不变式——脚本是第一个不经过浏览器的写入方。详见 §3.8 |

---

## 2. 场景

**这一节是全文的锚。** 后面每一条设计都应该能回指到这里的某一格；回指不上的就是多余的。

迭代 v2.3，测试任务里勾了 **120 条用例**。这 120 条里有 80 条已经有人写了脚本，
40 条只能手点——**平台不知道也不记录这个区分**（D19），脚本报上来哪条就是哪条。

| 时间 | 发生了什么 | 报告这时候显示 |
|---|---|---|
| 周一 | 建任务，勾 120 条，线下评审完，推到「待测试」 | 120 条全未测，完成率 0%，通过率 `—` |
| 周二 | 张三在自己机器跑 wdio，覆盖 80 条。SDK 报回 72 通过 / 8 失败，8 条失败各带截图和日志 | 任务自动变「测试中」。完成率 80/120，通过率 72/80 = 90% |
| 周三 | 李四手点剩下 40 条：36 通过 / 2 失败 / 2 阻塞（环境挂了） | 120 条全有结论，任务自动变「已完成」。完成率 100%，通过率 108/118 = 91.5% |
| 周四 | 开发修完 bug，张三重跑脚本 | 那 80 条刷新成 78 通过 / 2 失败，任务数字跟着变 |

**周二和周三写进去的是同一张表。** 张三的脚本和李四的鼠标在数据上是一回事，
状态机、报告、Jira 缺陷关联、提交锁死全部原样复用——这就是 D18 的全部内容。

### 2.1 唯一会打架的情况

周三李四复核了一条脚本报失败的用例，认定是脚本自己写错了，手动改成通过。
周四张三重跑，脚本又报失败。

**默认保留李四的判断**（D23）。这条被跳过，SDK 打印「跳过 1 条（已有人工结论）」，
报告的执行记录里也记这一笔。想强制覆盖，跑脚本时显式加参数。

默认值选 `false` 的理由：人工结论是**看过现场之后的判断**，脚本是每次都重新跑一遍的机械结果。
默认让机械结果冲掉人的判断，会让「复核」这个动作变得毫无意义——复核完下一次 CI 就没了，
那没人会再复核。反过来默认保留最多是让一条过时的人工结论多留一天，代价小得多。

### 2.2 混合报告特有的新风险

> 手工结论没有「版本」这回事。李四周三测的，就是周三那个包，没人会问是哪个 commit。
> 脚本结论有。它是**某一个 commit 跑出来的**。
> 两者混在一份报告里，如果不写明脚本那部分是什么时候、哪个 commit 跑的，那么代码又改了两轮之后，
> 报告上的数字**一个都没变，但已经不代表现在的代码了**，看报告的人完全无从察觉。

这是纯手工报告里根本不存在的风险，也是 D25（`automation_executions`）与 §6.3
（报告页的执行记录块）存在的**唯一**理由。除此之外，本期不给报告加任何东西。

### 2.3 第二个场景：一个人，五个任务

上面那张表只有一个测试任务，会让人误以为「一次上报 = 一个任务」。不是。

王五一个人负责五个模块，每个模块一千条用例。他很自然会建**五个测试任务**，
每个任务只勾自己那个模块的用例——这比建一个五千条的巨型任务好用得多。
然后他跑支付模块的脚本。

平台怎么知道这批结果该进哪个任务？**不需要知道，也不需要问他。**
支付模块那 200 条用例只出现在《支付模块》那个任务里，按用例反查就落在那儿。
再跑购物车的脚本，同理落进《购物车》。**SDK 配置一个字都不用改**（§3.7、D32）。

反过来，任何要求他「声明当前在测哪个任务」的设计——配置项、槽位、任务上的开关——
都是在逼他给一件库里已经写好的事实再声明一遍，而每迭代要改的参数第一次会忘、
第二次就没人用了（D31）。

**第三个场景**：他又建了个《v2.3 全量回归》，把五个模块全勾进去了。
这时支付模块的 200 条用例同时属于两个未提交的任务。跑支付脚本，
**两个任务都写**——这条用例在这个 commit 上过了就是过了，与几个任务在关心它无关（D33）。
需要保护的不是「归属唯一」，而是「别冲掉人已经下的判断」，那是 `overwriteManual` 的职责（§2.1）。

---

## 3. 数据模型

本期**不新建业务实体**，只加两张支撑表 + 三列。

### 3.1 新表 `schema/api-tokens.ts`

```ts
api_tokens                     -- 个人 token，一个人可以有多枚
  createdAt    timestamptz notNull defaultNow
  id           uuid pk defaultRandom
  lastUsedAt   timestamptz null      -- 每次成功鉴权后更新（节流，见 §4.3）
  name         text notNull          -- 用户自己起的备注名，如 "我的 MacBook"
  prefix       text notNull          -- 明文前 8 位，如 "as_7f3a9c1d"，列表页展示用
  revokedAt    timestamptz null      -- 吊销 = 写这一列，不删行（见下）
  tokenHash    text notNull UNIQUE   -- SHA-256 十六进制，绝不存明文
  userId       uuid notNull → users.id  onDelete cascade
  index (userId, createdAt desc)
```

**吊销用 `revokedAt` 而不是删行**：删了行，`lastUsedAt` 一起没了，
「这枚泄露的 token 最后一次被用是什么时候」这个唯一有用的问题就答不出来了。
鉴权查询一律带 `revokedAt IS NULL`。

**`onDelete: cascade` 是安全的**：删账号连 token 一起失效，正是想要的。
这跟 `test_runs.submittedBy` 那条 `set null` 不冲突——那里的 null 承载语义，这里不承载。

### 3.2 新表 `schema/automation-executions.ts`

```ts
automation_executions          -- 一次「跑脚本」的上下文，一次上报一行
  branch          text null
  ciUrl           text null    -- CI 里跑的话给链接，本机跑就是 null
  commitSha       text null
  completedAt     timestamptz null   -- 服务端全部写完才落；null = 这一轮没跑完，见 §5.5
  createdAt       timestamptz notNull defaultNow
  finishedAt      timestamptz null   -- SDK 报的脚本结束时间，与 completedAt 不是一回事
  id              uuid pk defaultRandom
  idempotencyKey  text notNull -- SDK 生成，见 §5.2
  projectId       uuid notNull → projects.id   onDelete cascade
  reportedBy      uuid → users.id  set null    -- token 的主人
  skippedCount    integer notNull default 0    -- 因 overwriteManual=false 跳过的条数
  startedAt       timestamptz null
  updatedCount    integer notNull default 0    -- 实际写进去的条数
  UNIQUE (projectId, idempotencyKey)
  index (projectId, createdAt desc)
```

⚠️ **挂在项目上，不是挂在测试任务上。** 一次跑脚本可能同时写进多个测试任务（§3.7 D33），
`runId notNull` 那种写法一开始就把「一次执行 = 一个任务」焊死了，
之后要么一次执行拆成 N 行（幂等键立刻失效），要么随便挑一个 runId 记上去（记的是假话）。

「这次执行影响了哪些任务」不存在这张表里，由 `test_run_cases.lastAutomationExecutionId`
反查——那本来就是真相所在，多存一份关联表只是多一个会漂的副本。
报告里的执行记录块（§6.3）按 `runId` 过 `test_run_cases` 再 join 回来，天然只看得见
与本任务相关的那些执行。

**这张表只被报告的执行记录块读**，不参与任何统计口径。
它是「解释性材料」，不是结论——`skippedCount` / `updatedCount` 是**全局**冗余计数
（跨所有被写入的任务），只为让「我上次那轮跑了多少条」一条 SQL 出完；
任何按任务的数字都必须回 `test_run_cases` 算，不许读这两列。

### 3.3 `test_run_cases` 增两列

```ts
  executedVia                test_run_executed_via null   -- 'manual' | 'automation'
  lastAutomationExecutionId  uuid null → automation_executions.id  set null
```

`executedVia` **可空**：未测的行没有执行方式。所以分布上天然是三个桶——手工 / 自动化 / 未测。

`lastAutomationExecutionId` 用 `set null` 而不是 `restrict`：执行记录是辅助材料，
将来清理老记录不该被结论行卡住；断了链接最多是失去一条 CI 链接，不影响结论本身。

### 3.4 `test_run_attachments` 增一列

```ts
  uploadedVia  test_run_executed_via null    -- 与上面共用同一个 pgEnum
```

同一个枚举复用，不新造。附件上传方与结论来源可以不一致（李四给脚本报的失败补了张手工截图），
所以它独立成列而不是去 join `test_run_cases.executedVia`。

### 3.5 为什么**不**给 `test_cases` 加「执行方式」字段（D19）

因为它是把一个已经存在的事实抄第二份。

`schema/test-runs.ts` 里那段写得很清楚：「把状态做成**结果的函数**而不是一个要人维护的开关，
是唯一不会对不上账的做法」。一条用例有没有脚本，是脚本那边说了算的；平台存一份人工标注的副本，
第一天就开始漂——脚本删了没人回来改标记，新写了脚本没人回来打勾，最后所有人都不信这一列。

**要「自动化覆盖率」就去历史里查**：一条用例算不算被自动化覆盖 =
它在历史测试任务里被 `executedVia = 'automation'` 打过结论。零维护、零漂移，
而且这个定义比人工标记诚实——脚本写了但从没跑通过，本来就不该算覆盖。

**也不要拿 `sourceRef` 当「有脚本」的判据**：它被 `case-import-repository.ts`
当外部 ID 用了，导入进来的用例带着 `sourceRef` 但没有脚本。
`sourceRef` 在本期只有一个身份——**上报时用来找到用例的锚点**，仅此而已。

### 3.6 ⚠️ `executedVia` 必须跟着一起清（硬性验收点）

`test-run-verdicts-repository.ts` 的 `buildResultPatch` 在 `result === "untested"` 时
会清掉 `caseVersion` / `comment` / `executedAt` / `executedBy`。
**`executedVia` 与 `lastAutomationExecutionId` 必须加进这个清除列表。**

漏掉的后果是出现「未测但标着自动化执行」的行——正是那段注释里说的「幽灵记录」，
而且它会同时污染执行台的筛选和未测计数，不会有任何地方报错。

### 3.7 归属解析：本期**不新增**任何「上报目标」表（D32 / D33）

这一节曾经设计过一张 `automation_targets` 指针表（「我的自动化结果往哪个测试任务写」），
已整个删除。留下过程是因为那两版错法都很有诱惑力，写下来免得有人再走一遍。

**规则一句话：这条用例在哪些未提交的任务里，就写进哪些。**

```
sourceRef → caseId（项目内唯一，靠 test_cases_project_id_source_ref_uq）
候选 = 该项目下所有未提交任务中，包含这条 caseId 的 test_run_cases 行
   0 行  → outOfScope，列进对账单（D35）
   n 行  → n 行全写
```

不需要任何声明。**用户建任务时勾了哪些用例，这件事本身已经声明了归属**，
上报时按同一份声明反查回去即可；再让他在 SDK 里声明第二遍，只是给同一件事
造第二个真相来源，两处一旦不一致，错的永远是没人看的那一处。

#### 为什么「候选 ≥ 2」不是错误，而是正常情况

结论是关于**用例**的事实，不是关于任务的事实。`PAY-LOGIN-001` 在 `commit abc123` 上通过了——
这句话为真与「几个任务在关心它」无关。两个未提交的任务都勾了它（回归任务 + 专项任务，
或者上个迭代还没关），只说明这个事实有两处登记点，不说明它有歧义。

「只要用例没被改动」这个限定条件平台天然满足：用例在项目里只有一份，
两个任务引用的是同一个 `test_cases` 行，`caseVersion` 子查询取回的是同一个版本号。
不存在「在 A 里是 v3、在 B 里是 v4」这种情况。

因为两个人都关心一条用例，就把一个为真的结论丢掉，是平台在替用户裁决——
与 D19（不加「执行方式」字段）、D23（覆盖策略参数化）是同一条底线。

真正需要保护「别人已经下的判断」的地方是 `overwriteManual`（D23），**它按行生效**：
李四的任务里那条已经有人手工打了 `failed`，脚本报 `passed`，默认不覆盖，
列进 `skippedManual`。归属解析不承担这个职责，也不该承担。

⚠️ **扩散必须看得见。** 对账单里 `updated` 不是一个数字，是按任务分组的
`writtenTo: [{ runId, runName, updated }]`。一次上报写进了三个任务，SDK 输出里
就得有三行。静默写进别人的任务，和写错任务一样糟。

要收窄有显式出口：上报时带 `runIds` 白名单（§5.1.1），"我这轮只往这几个任务报"。
不传就是全写，所以它不是配置，不违反 D31。

#### 错法一：`test_runs` 上加一个「接收自动化上报」开关

唯一约束只能落在 `(projectId, slot)` 上，等于假设**一个项目同一时刻只有一个接收任务**。
一个项目四个 QA 各建各的迭代，第二个人打开开关的瞬间第一个人的被静默让出，
之后张三跑的脚本写进李四的任务，两份报告的数字都错，没有一处会报错。

#### 错法二：按人建指针表，`UNIQUE (userId, projectId, slot)`

比错法一宽，但仍然假设**一个人同一时刻只有一个接收任务**。
一个人测 5 个模块、每个模块 1000 条用例，很自然会建 5 个任务各含各的模块——
这时四个指针里选哪个都是错的，只能逼他手工维护 5 个 slot，
而每迭代改 SDK 参数正是 D31 存在的理由。

两条错法犯的是同一个错：**用「人」或「开关」去猜归属，而归属数据本来就在库里。**

#### 副产物：上个迭代忘了 close 不再是问题

旧任务和新任务都勾了这批用例 → 两边都写。旧任务的数字确实变了，
但它本来就还没提交、还在接收结论，这跟手工在旧任务里补测是同一件事。
对账单里那行 `《v2.2 回归》 written 187` 就是最直接的提醒。

> 顺带记一笔，**不在本期处理**：测试任务卡在「测试中」永远不结束，是第二期留下的口子——
> 自动提交只从 `completed` 起算，一个没测完的任务不会自己结束。要不要给它加提醒是
> phase2 的议题，本期不扩范围。

选出候选任务之前还要先跑一次自动提交结算，理由见下一节。

### 3.8 选出候选任务之前先跑一次自动提交结算（D36）

先把术语说清楚，后文一直在用：

- **测试任务** = 一堆测试用例的集合（第二期的 `test_runs` + `test_run_cases`）。
- **候选任务** = 这一次上报的结果**可以写进去的那些测试任务**。自动化是按 case 上报的，
  所以流程是：筛出 case → 反查它在哪些任务里有对应的行 → 写进去（§3.7）。
  一条 case 可能同时属于多个任务，所以候选是个集合，不是一个。
- **选出候选任务** = 跑 §5.3 那条 SQL。

#### 惰性自动提交是第二期的既定设计，不是本期引入的

第二期计划 §2.5「自动提交的实现」写得很明确：**不引入定时任务框架**，
判定谓词直接放在**读路径**入口惰性结算。三个入口：
`test-runs-repository.ts:115`（列表）、`test-run-detail-repository.ts:97`（详情）、
`test-run-report-repository.ts:232`（报告）。

它当时的论证是成立的，原话是「报告页本身就是访问点，用户看到的永远是已结算的状态」。
更关键的是第二期没写出来的那一半：**第二期所有的写入方都是浏览器里的人**——
要给用例打结论，就必须先打开那个任务的执行台，而打开就结算了。
所以「已到期的任务还能被写入」在第二期不会发生。

因此 `submitted_at` 在库里表达的不是「是否已提交」，而是「是否已经有人来结算过」。
这是第二期就有的性质。

#### 第三期打破了那个前提

**脚本是第一个不经过浏览器的写入方。** 不先结算的后果：

| 时间 | 发生了什么 |
|---|---|
| 第 1 天 | 任务完成，`completedAt` = 第 1 天。报告页显示「将于第 4 天自动提交」 |
| 第 4 天 | 到期。但没人打开过任何页面，那条 UPDATE 没跑，库里 `submitted_at` 仍是 NULL |
| 第 5 天 | 脚本上报。`submitted_at` 是 NULL → `ensureRunWritable` 放行 → 写入 |
| …… | 只要一直没人打开页面，第 12 天、第 30 天的上报同样会被放行 |

⚠️ **这不是数据损坏，是冻结期限失效，而且失效时长没有上限。**
不要把它误读成「已提交的任务里出现了提交之后的结论」——那种事不会发生，
写入那一刻 `submitted_at` 确实是 NULL，`ensureRunWritable` 没有被绕过，
时间戳顺序也自洽。坏的是**策略**：这个任务本该在第 4 天冻结，它却接受了第 30 天的写入。

也不要以为写入会把倒计时往后推：`applyRunStatusDerivation` 在没有状态跃迁时
`steps.length === 0` 直接返回（`test-run-status-repository.ts`），
`completed → completed` 根本不走那条 UPDATE，`completedAt` 一动不动。
所以这个任务会永远停在「已到期、未结算」，窗口不会自己关上。

#### 修法：把第二期那条不变式补回来

**每个写入方在写之前都先结算。** 第二期靠「人必须先打开页面」天然满足，
第三期的脚本不满足，所以 ingest 要显式调一次——就这么一条，不是什么新机制。
`WHERE submitted_at IS NULL` 让它天然幂等，并发调用只有一个事务会更新到行。

**定时扫描后来加上了，但它替代不了这一次结算**（2026-08-24 修订本段）：
写这份文档时「不加定时任务」还是有效结论，`plans/011` 之后不再成立——
`apps/server/src/jobs/auto-submit-scan.ts` 每天 03:00 跑一次 `settleAutoSubmitAll()`，
连完全没人碰的项目也会被兜底结算。

但那是**天级**兜底，ingest 要的是**写入那一刻**的准确性。一个任务上午 10:00 到期，
下一次扫描在次日 03:00，中间十七个小时里它照样是「已到期、未结算」，
上面那张表的时间线原样成立——只是失效窗口从「没有上限」缩短成「不超过一天」。
**缩短不等于消除**，ingest 写之前那一次显式结算不能省。

三层防御各司其职（`plans/011` D3）：读路径惰性结算（秒级，有人看的时候）、
ingest 写前结算（本节，写入那一刻）、每日扫描（天级，零访问兜底）。
本节要的是第二层。

## 4. 认证：个人 API Token

### 4.1 为什么是个人的，不是项目级机器身份

因为脚本是**各个 QA 自己跑的**，不是一个无人值守的机器人在跑。跑脚本的张三就是测试的张三，
只是他这轮用的工具是 wdio 而不是鼠标。

个人 token 换来三件事：`executedBy` 直接记真人，那个 users 外键的难题根本不出现；
报告里「这 80 条是张三跑脚本报的」是有意义的信息，而不是一个匿名机器人；
将来真要进 CI，开个专用账号拿它的 token 就行，不用另设一套机制。

### 4.2 存哈希，不存可逆密文

跟 `jira_configs.apiTokenCipher` 走的是**相反**的路子，别照抄：
Jira token 要拿去调 Jira，所以必须可逆（`secret-box.ts` 的 `encryptSecret`）；
本期的 token 平台**只需要校验，永远不需要还原**，存可逆密文纯属给自己留个可以被脱库解密的洞。

也**不要**用 `packages/db/src/password.ts` 的 PBKDF2。两条理由：

1. **必须能按哈希做索引查找**。鉴权是 `WHERE token_hash = ? AND revoked_at IS NULL` 一次命中；
   PBKDF2 每行盐不同，只能全表扫着逐行验，token 一多就废。
2. **慢哈希在这里没有意义**。PBKDF2 是为低熵的用户密码准备的，防的是离线爆破字典；
   token 是 32 字节 CSPRNG 随机串，爆破空间大到无所谓，SHA-256 足够。

明文只在创建那一刻返回一次，之后任何接口都拿不到，列表页只显示 `prefix` + 备注名。

### 4.3 校验路径

请求头 `Authorization: Bearer as_xxxxx`。校验顺序：算 SHA-256 → 查 `api_tokens` →
`revokedAt IS NULL` → 取 `userId` → **复用 `context.ts` 里已有的那次 users 读库**，
拿 `disabledAt` / `role`。停用的账号连带其全部 token 立即失效，跟会话是同一套判据，
不再造第二套。

`lastUsedAt` **节流更新**：同一枚 token 一分钟内只写一次。它的用途是
「这枚 token 还在不在用 / 泄露了最后一次被用是什么时候」，精确到分钟绰绰有余；
每次上报都 UPDATE 一行，只是在最热的路径上白加一次写。

### 4.4 权限边界

token 的权限**严格等于其主人**，不放大也不缩小。本期不做 scope（只读 / 只写 / 限某项目）——
没有真实需求，加了就是三个 SDK 都要多传一个谁也不理解的参数。

但 ingest 端点本身只暴露上报所需的那几个操作（§5.1），token 拿不到「删项目」这种能力，
不是因为 scope 限制了它，而是因为**那些能力压根不在这条路由上**。

---

## 5. Ingest API

### 5.1 SDK 配置里只允许出现跨迭代稳定的标识（D31）

**`runId` 不能出现在 SDK 配置里。** 每个迭代一个新测试任务，写死 runId 意味着每个迭代
都要有人去改 CI 变量或本机配置——这种手动步骤第一次会忘，第二次就没人用了。

SDK 只配两样，全部跨迭代不变：

```
AS_TOKEN    = as_xxxxx      个人 token
AS_PROJECT  = <projectId>   项目 id
```

没有第三样。**没有槽位、没有环境、没有「上报目标」要维护**——归属由用例自己解析（§3.7），
而用例归属这份数据在用户建任务勾用例的那一刻就已经写进库里了。

服务端也**不接受** `runId` 参数：不是没实现，是刻意不给。留一个能传的口子，
就一定会有人在 CI 里写死一个 runId，然后在下个迭代变成一条静默写错任务的路径。

`projectId` 是唯一还需要人填的东西，因为 `sourceRef` 的唯一性作用域就是项目
（`test_cases_project_id_source_ref_uq`）。它跟着仓库走，建一次不再变。

### 5.1.1 端点

注册位置：`apps/server/src/index.ts` 里 **`registerJiraWebhook(app)` 旁边，oRPC 中间件之前**。
理由与 Jira webhook 完全同构——这是外部来的、没有会话 cookie 的请求，
走一遍 `createContext` 只会白做一次 cookie 解析加一次读库。

```
GET  /ingest/runs?projectId=            → 该项目当前所有未提交任务（可选的预检 / 白名单取值）
POST /ingest/executions                 → 上报一次执行的全部结果
POST /ingest/attachments/presign        → 换一批预签名 PUT URL
```

**没有 `/ingest/target`，也没有任何地方接受 `runId` 作为「往哪写」的输入。**
归属由用例解析（§3.7），给一个能传的口子就一定会有人在 CI 里写死它，D31 立刻作废。

`GET /ingest/runs` 只是把候选摆出来给人看，SDK 不依赖它就能上报：

```jsonc
{
  "runs": [
    { "runId": "uuid", "name": "v2.3 回归",     "status": "in_progress",
      "caseCount": 1000, "daysSinceLastVerdict": 0 },
    { "runId": "uuid", "name": "v2.2 回归",     "status": "in_progress",
      "caseCount": 1000, "daysSinceLastVerdict": 12 }
  ]
}
```

`daysSinceLastVerdict`（距最近一条结论多少天，没有结论则距创建时间）在这里的用途是
让人自己发现「v2.2 十二天没动静了，是不是忘了关」。**平台只披露，不裁决**——
它照样是候选、照样会被写入，因为它确实还没提交。同 §6.4「不做自动化结果过期判定」。

`POST /ingest/executions` 的请求体：

```jsonc
{
  "projectId": "uuid",
  "idempotencyKey": "uuid",         // SDK 生成，见 §5.2
  "overwriteManual": false,         // D23
  "runIds": null,                   // 可选白名单，见下；null = 全部候选
  "branch": "main",
  "commitSha": "a3f9c2e",
  "ciUrl": null,
  "startedAt": "2026-08-25T06:00:00Z",
  "finishedAt": "2026-08-25T06:14:22Z",
  "results": [
    { "sourceRef": "PAY-LOGIN-001", "result": "passed", "durationMs": 1820 },
    { "sourceRef": "PAY-LOGIN-002", "result": "failed", "durationMs": 4110,
      "message": "expected 200, got 500" }
  ]
}
```

`runIds` 是「我这轮只往这几个任务报」的显式收窄，**不传即全写**，所以它不是每迭代要维护的
配置，不违反 D31。传了之后候选集先与它取交集，交集为空的那些结果进 `outOfScope`。
它存在的意义是给「我知道自己在干什么」留一条路，不是给 SDK 配置文件用的。

响应体是**一份对账单**，不是一个 `{ ok: true }`：

```jsonc
{
  "executionId": "uuid",
  "writtenTo": [                                        // D34：扩散必须看得见
    { "runId": "uuid", "runName": "v2.3 回归",     "updated": 78 },
    { "runId": "uuid", "runName": "支付模块专项",   "updated": 12 }
  ],
  "skippedManual":  [{ "sourceRef": "PAY-CART-007", "runName": "v2.3 回归",
                       "reason": "已有人工结论" }],
  "unmatchedCases": [{ "sourceRef": "PAY-NEW-099",
                       "reason": "项目里没有这个 sourceRef 的用例" }],
  "outOfScope":     [{ "sourceRef": "PAY-CART-031", "caseId": "uuid",
                       "reason": "不在任何未提交任务的范围内" }]
}
```

`writtenTo` 按任务分组、SDK 逐行打印，是 D34 的落点：一次上报写进了三个任务，
日志里就得有三行。**静默写进别人的任务，和写错任务一样糟**——两者的区别只在于
后者有人会发现。同理，`skippedManual` 带 `runName`，否则一条 sourceRef 在
A 任务写成功、在 B 任务被人工结论挡下，对账单上会看起来自相矛盾。

三类拒绝**逐条列出、绝不静默丢弃**，SDK 原样打印。这沿用
`test-run-case-guards.ts` 里 `InvalidRunCases` 的既定语义：「整批拒绝，不静默丢弃」。

`outOfScope` 与 `unmatchedCases` 是两件不同的事，不能合并：前者「用例存在，但没有任何
未提交的任务收它」，前端能拿 `caseId` 做「一键追加到某个任务」（D24）；后者「项目里
压根没有这条用例」，多半是 `sourceRef` 拼错或者用例还没建，追加按钮无从谈起。
**都不自动追加**：静默追加会改掉报告的分母，与第二期 §2.3「报告任何时刻都自洽」直接冲突。

`message` 落进 `test_run_cases.comment`。SDK 侧负责截断（建议 2000 字符），
完整堆栈当 `log` 附件传——`comment` 是给人在失败清单上一眼扫的，不是日志容器。

### 5.2 幂等

`idempotencyKey` 由 SDK 生成（一次进程启动一个 UUID），`UNIQUE (projectId, idempotencyKey)`。
重复提交同一个 key：**不报错**。已完成的那一轮直接返回缓存的对账单（含当时的
`writtenTo` 分组）；上一轮没跑完的（`completedAt is null`）则整轮重跑，理由见 §5.5。

作用域是项目而不是测试任务，与 §3.2 同因：一次执行本来就可能横跨多个任务，
键挂在任务上就会出现「同一次执行在 A 任务已落库、在 B 任务还没落」的半完成状态，
而重试时它看起来是两个不同的幂等判定。

三种语言都会重试（超时、网络抖动、CI retry），幂等必须在协议层解决，
不能指望三个 SDK 各自写对。这跟第二期「重复提交同一个测试任务不报错」是同一条原则。

### 5.3 sourceRef 解析

`(projectId, sourceRef)` 上已经有部分唯一索引（`test_cases_project_id_source_ref_uq`，
`WHERE source_ref IS NOT NULL`），一次 join 直接落到 `caseId`。

从 `caseId` 到 `test_run_cases` 行是**一对多**（§3.7 D33）：

```sql
-- 整批一条 SQL 解析完，不许 N+1；返回值天然就是 (sourceRef, runId, runCaseId) 三元组
select tc.source_ref, trc.run_id, trc.id
  from test_cases tc
  join test_run_cases trc on trc.case_id = tc.id
  join test_runs tr       on tr.id = trc.run_id
 where tc.project_id = $1
   and tc.source_ref = any($2)
   and tr.submitted_at is null          -- 未提交才是候选
   and ($3::uuid[] is null or tr.id = any($3))   -- 可选的 runIds 白名单
```

⚠️ 解析出的三元组**按 runId 分组**之后，每组各自调一次 `bulkSetRunCaseResult`（§5.4）——
那个函数签名里的 `runId` 是必传的，理由是避免跨测试任务批量时的有序加锁
（见 `BulkSetRunCaseResultInput.runId` 的注释）。**不要**为了「一次写完」去改它的签名，
那条注释拦的正是本节会引入的那个死锁。分组循环的代价是 N 个事务，N 是候选任务数，
现实里 1～3 个。

`submitted_at is null` 这个条件必须在**选候选任务时**就生效，而不是靠
`bulkSetRunCaseResult` 里的 `ensureRunWritable` 兜底：兜底会让一次上报因为某个
无关的已提交任务在候选里而整批失败，而那个任务根本不该出现在候选里。
`ensureRunWritable` 仍然要跑（它在行锁下判定，是唯一权威），但它拦下的应该只剩
「选出候选之后、写入之前的那一瞬间被人提交了」这一种真正的竞态。

### 5.4 ⚠️ 必须走 `test-run-verdicts-repository.ts`（D22，本期最不能让步的一条）

ingest 端点只做三件事：**鉴权 → 解析 sourceRef → 调结论写入仓储**。
**绝不另开一条 insert/update。**

> **函数名修正（2026-08-24，实现时发现）**：本节原写「调 `bulkSetRunCaseResult`」，
> 字面上做不到。那个函数的签名是「整批**一个** `result`、且没有 `comment`」，
> 而一次上报里每条用例各有各的结论、失败的还各带一条 message 要落进 `comment`；
> 照字面调只能退化成逐条循环，那恰恰是 §5.5 在拦的东西。
> 实际落地的是同文件、同守卫的第二个入口 `applyAutomationVerdicts`
> （每条各带 result/comment，整批仍只发一条 UPDATE + 一条 INSERT）。
> 本节真正的红线从来不是「调哪个函数」，而是**别绕开下面这四道守卫**——这一条不变。

这样四件事全是白拿的，一行新代码都不用写：

| 白拿的 | 来自 |
|---|---|
| `submitted` 测试任务拒收，且拒绝在事务内同一把行锁下 | `ensureRunWritable` |
| 「待评审」的任务拒收 | `test-run-case-guards.ts` 的 `RunReviewPending` |
| `ready → in_progress → completed` 自动流转 | `applyRunStatusDerivation` |
| 结论变更审计流水 | `test_run_case_events` |

反过来，只要有人图省事在 ingest 里写一句 `update test_run_cases set result = ...`，
上面四条会**同时**失效，而且没有任何测试会红——这就是为什么它排在决策表里而不是实现细节里。

`SetRunCaseResultInput.actorId` 现在的签名已经是 `string | null`，
本期给它和批量版各加一个 `via: 'manual' | 'automation'` 参数即可；
手工路径显式传 `'manual'`，不给默认值——给了默认值，将来第三种来源接进来时会静默混进手工统计。

### 5.5 批量与锁

`ensureRunWritable` 对 `test_runs` 行加 `FOR UPDATE`。逐条上报 = 逐条开事务抢同一把行锁，
80 条就是 80 次串行往返，并发跑两个 suite 还会互相干等。

**SDK 攒完一次执行的全部结果一次提交**（D29），超过 200 条分批。

服务端侧的事务边界是**每个候选任务一个事务**（§5.3 那条注释解释了为什么不能合并）。
写入顺序：

1. 先 upsert `automation_executions` 那一行（`completedAt = null`），它同时是幂等键的占位
2. 按 runId 分组，每组一个事务：`applyAutomationVerdicts`
   （`executedVia` / `lastAutomationExecutionId` 就在那条 UPDATE 里一起写掉，
   本节原先列的「回填 `lastAutomationExecutionId`」不是单独一步）
3. 全部成功后再写 `completedAt` 与两个冗余计数

⚠️ 中途失败会留下一行 `completedAt = null` 的执行记录，此时冗余计数是**不完整的**——
这就是 §3.2 说「任何按任务的数字都必须回 `test_run_cases` 算」的实际原因，
不是洁癖。报告里的执行记录块要把未完成的那行标出来，不能当成完整的一轮展示。

**重放是安全的**，这是把事务拆开的前提：同一个 `(runId, runCaseId, result)` 再写一次，
`buildRunCaseEventRows` 因 `fromResult === toResult` 返回空数组，不会在审计流水里
留下一串 `passed → passed`（`test-run-verdicts-repository.ts` 里那条注释）。
所以带同一个 `idempotencyKey` 重试时，**若那行 `completedAt` 仍是 null 就整轮重跑**，
已经写好的任务被重跑一遍是无害的；只有 `completedAt` 非空才直接返回缓存的对账单。

### 5.6 附件

复用第二期整套：`packages/api/src/lib/attachment-policy.ts` 的
`validateAttachmentUpload` / `buildAttachmentStorageKey`，key 规则
`test-runs/{projectId}/{runId}/{runCaseId}/{kind}-{uuid}.{ext}` 原样适用，
`packages/api/src/lib/r2.ts` 的 `getR2Storage()` 原样适用。

本期只加两样：

1. **一条 token 鉴权的 presign 路由**（现有的走 `protectedProcedure`，token 进不去）。
   写入时 `uploadedVia = 'automation'`。
2. **配额**。自动化会让附件量暴涨——每条失败自带截图 + 日志 + 录屏，一次执行可能几百个文件。
   单次执行的**条数上限**与**总字节上限**，超了拒绝并在对账单里说明。
   单文件大小仍由现有的 `MAX_ATTACHMENT_BYTES` 管，不另立一套。

R2 未配置时（`getR2Storage()` 返回 null），结论照常上报，附件部分降级为拒绝并在对账单里说明——
与第二期 D9「Jira 未配置必须优雅降级」同构：**附件传不上去不能拖垮整次上报**。

#### 一条结果写进了多个任务，附件怎么办

key 规则里含 `{runId}/{runCaseId}`，而同一条 sourceRef 可能对应多个任务的多个 run_case 行（D33）。
**每个 run_case 各上传一份，各自独立的 object**。presign 路由按 sourceRef 请求、
按解析出的 run_case 逐个返回 URL，SDK 拿到几个就传几次同一个文件。

看着浪费，但另一条路更糟：一份 object 挂 N 个 `test_run_attachments` 行，
删除任意一行都要先判断「还有没有别人引用这个 key」，否则要么删出死链、要么留下永不回收的孤儿。
现有的附件删除路径完全没有这个概念，为了省几张截图的存储去给它引入引用计数，
换来的是一条以后一定会踩的坑。候选任务现实里 1～3 个，代价是几百 KB。

配额按**单个任务**计，不是按整次执行的总和——否则一个人的执行横跨三个任务时，
配额会莫名其妙地缩水成三分之一。

### 5.7 实时同步：零新代码

上报成功后**对每个被写入的任务各发一条** `entity: "testRun"` 的失效事件（`publishInvalidate`）。
`apps/web/src/realtime/map-invalidate.ts` 里 `testRun: ["testRunAttachments", "testRuns"]`
已经把列表、详情、报告、附件四处缓存全覆盖了，本期**一处都不用改**。

效果：张三在自己机器上跑完脚本，正开着执行台的李四屏幕上数字直接跳。
横跨三个任务的一次上报会发三条，三个任务的观众各自刷新——漏发其中一条的表现是
「有人的页面永远停在旧数字」，而这种 bug 只有恰好开着那个页面的人才碰得到。

### 5.8 边界情形

归属改成按用例解析（§3.7）之后，「上报目标」相关的三种边界情形整个消失了：
没有目标可设，也就没有「忘了设」「设错了」「目标被提交了」。剩下这些：

| 情形 | 平台返回 | 人该怎么办 |
|---|---|---|
| 这批 sourceRef 一条也没匹配上用例 | `200` + `writtenTo: []` + 全量 `unmatchedCases` | 检查 `AS_PROJECT` 是否指对项目、用例上的 `sourceRef` 是否填了 |
| 用例都在，但没有任何未提交任务收它 | `200` + `writtenTo: []` + 全量 `outOfScope` | 建这个迭代的测试任务并把这些用例勾进去 |
| 候选任务还在「待评审」 | 该任务不写入，进 `outOfScope` 并注明原因；其余任务照常写 | 评审完点「评审完成」，重跑一次 |
| 上报进行到一半，某个任务被人提交 | **只有那个任务**的事务回滚，其余任务照常写；该任务进 `outOfScope` | 建重测任务，重跑 |

⚠️ 注意后两行的语义变化：**局部失败不再让整批失败**。
一次上报横跨三个任务，其中一个还在评审、另一个刚被提交，不该拖累第三个——
第三个任务里那些结论是真的，凭什么因为无关任务的状态丢掉。
`bulkSetRunCaseResult` 的返回值本来就是类型化的（`RunReviewPending` / `RunLocked`），
按任务分组之后每组各自处理返回值，这是白拿的。

`writtenTo` 为空时仍然返回 `200` 加一份说明详尽的对账单，而不是 4xx——
SDK 侧负责把「一条都没写进去」翻译成非零退出码（§7.2 第 4 条）。
分工是：HTTP 状态码表达「请求本身有没有问题」，对账单表达「业务上发生了什么」。
把「没有任何任务收这批用例」做成 404，会让 SDK 分不清是网络/路由错还是业务结果。

**为什么「待评审」要拒**（不只是状态机一致性）：评审没结束意味着用例清单**还可能增删**，
这时候打结论——人打的还是脚本打的都一样——是对着一份没定稿的清单打。
更要命的是，允许脚本在评审期写入，会出现「评审会还没开，任务里已经躺着 60 条通过了」，
会上大家看到的东西就被污染了。

**为什么没有任何候选任务时不自动建一个**（D35）：用例范围从哪儿来？
脚本报了 80 条就建一个 80 条的任务？那既绕过了评审，也不是「这个迭代要测的范围」——
凭空多出来的任务只会变成没人认领的垃圾。

**为什么也不做「待归属结果」暂存区**：要配一整套 UI、认领逻辑、过期清理，
收益只是挽救「还没建任务就先跑了脚本」这一种失误。而真正的理由是——

> **脚本可以重跑，所以拒绝的代价很低。**
> 手工测试结果丢了是灾难，脚本重跑一遍不是。这正是自动化的意义所在。

而且这一版里「白跑二十分钟」的窗口本来就小得多：不需要任何预先配置，
只要这个迭代的测试任务建好了、用例勾进去了，脚本跑完就一定有地方落。

---

## 6. 报告

### 6.1 不变的部分（先说这个，因为它占 95%）

- 顶部四个数字、完成率、通过率 —— **算法一个字不改**。
  `test-run-metrics-core.ts` 里「通过率分母不含阻塞与跳过」的口径原样保留。
- 按模块分布、按优先级（P0 红线）、失败清单、提交条 —— 原样。
- 全部仍是**实时查询，没有任何快照**。第二期 §2.3 那套论证在混合场景下一字不改。
- `submitted` 之后 SDK 上报被拒，走的是同一个 `ensureRunWritable`，不为自动化写第二套守卫。

**头条数字不分栏（D26）。** 一个迭代对外汇报的就是「这个迭代的通过率」，
拆成两个数会让报告立刻失去可引用性——别人问「这迭代测得怎么样」，答不上一个数。
执行方式的分布，顶部一行灰字「其中 80 条由脚本执行」就够了，不单独出卡片、不单独算率。

### 6.2 失败清单补上「怎么复现」

读报告的人看到一条 failed，第一个问题永远是「能重现吗」。

李四手工测出来的失败，报告上写的是「李四，周三 15:20，说明：优惠券金额算错」——
`TestRunFailedCase` 里已经有 `executedByName` / `executedAt` / `comment`，够了。

张三脚本报的失败，光有这些不够。得写清楚**哪个分支、哪个 commit、哪次执行**，还要能点回 CI。
不然三天后有人看到这条失败想复现，无从下手。

`TestRunFailedCase` 加两项：

- `executedVia` —— 行上一个脚本标记，一眼分清人测的还是脚本报的
- `automationExecution`（branch / commitSha / ciUrl / finishedAt）—— 经
  `lastAutomationExecutionId` 左连接取

**走同一条查询**，跟 `attachmentCount` 一样。`test-run-report-repository.ts` 顶上那条
「不许 N+1，它们都只是同一批行的不同切法」的原则，本期新增的聚合同样适用。

`executedByName` 保持不变：个人 token 让自动化上报也有真人署名，这一列对两种来源都成立。

附件那套「只给计数不给 URL」的设计不用动——它恰好就是为这个量级准备的。

### 6.3 新增一块「自动化执行记录」

一个列表，每行：执行时间、上报人、分支、commit（短 hash，有 `ciUrl` 就链过去）、
刷新条数、**跳过条数**。

```
周二 14:00   张三   main   a3f9c2   刷新 80 条
周四 10:30   张三   main   7b1e04   刷新 79 条，跳过 1 条（已有人工结论）
```

存在的唯一理由是 §2.2 那个风险，别给它加别的职责。

⚠️ **这里的「刷新 80 条」必须是本任务的条数，不能读 `automation_executions.updatedCount`。**
一次执行可能同时写进多个任务（§3.7 D33），那两个冗余计数是**跨任务全局**的，
直接显示会让「刷新 80 条」出现在一个总共才 40 条用例的任务里。
本块的取数路径是：`test_run_cases where run_id = ? and last_automation_execution_id is not null`
按 executionId 聚合，再 join 回 `automation_executions` 取分支与 commit——
和 §6.2 一样，还是同一批行的不同切法，不许 N+1。

一次执行横跨多个任务时，这一行在每个任务的报告里各出现一次、各显示各的条数，
这正是想要的：读 v2.3 回归报告的人，不需要知道这次执行顺带也刷新了支付专项。
未完成的那一轮（`completedAt is null`，§5.5）要标出来，不能当成完整的一轮展示。

**跳过条数必须露出来。** 否则会出现这样的事：张三跑了脚本，以为 80 条都刷新了，
实际上 12 条因为有人工结论被跳过了，报告里那 12 条还是三天前的判断——而他不知道。

**位置：报告正文里，失败清单之后。** 它是解释性材料，不是结论，不该抢在失败清单前面。

### 6.4 明确不做

- **不做跨测试任务的自动化趋势曲线**。那是另一个产品，等有半年真实数据再谈。
- **不把「自动化通过率」提成头条数字**（理由见 §6.1）。
- **不做「自动化结果已过期」的自动判定**。平台不知道当前 commit 是什么，
  只呈现事实（这批结果跑在 a3f9c2 上），判断交给读报告的人。
  做成自动判定就得让平台去连代码仓库，那是另一期的事。
- **不做报告快照**。第二期 §2.3 已经论证过，本期不重开这个议题。

---

## 7. SDK（三语言）

### 7.1 契约先于任何一个 SDK 定稿（D27）

三个 SDK 的直接后果是：**不能让 Node 版先跑起来再倒推协议**。

`apps/server/src/index.ts` 上已经挂着 `OpenAPIReferencePlugin`，
ingest 端点的 zod schema 直接产出 OpenAPI，**那份就是三个 SDK 共同的唯一规范**。
任何一个 SDK 想要协议改一个字段，改的是 schema，然后三家一起跟。

### 7.2 三个 SDK 必须一致的五件事

写进每个 SDK 的验收清单，不许各自发挥：

1. **缓冲后批量提交**（D29）。QA 本机跑，网络不稳，跑一条报一条既慢又碎。
2. **幂等键**：一次进程启动生成一个 UUID，重试时**复用**（重新生成就等于没有幂等）。
3. **对账单原样打印**：`writtenTo` 按任务逐行打，跳过 / 未匹配 / 越界三类逐条打。
   这是用户唯一的反馈渠道，尤其是 `writtenTo`——它是「这轮结果扩散到了哪些任务」
   的唯一披露点（D34），吞掉它就等于静默写进别人的任务。
   ```
   写入 《v2.3 回归》      78 条
   写入 《支付模块专项》   12 条
   跳过 1 条（已有人工结论）：PAY-CART-007 @《v2.3 回归》
   越界 1 条（不在任何未提交任务里）：PAY-CART-031
   ```
4. **`writtenTo` 为空要显式报错**，退出码非零。这一条覆盖了所有「一条都没写进去」
   的情况——项目里没有对应用例、用例没被任何未提交的任务收、以及 D30 那种
   候选全被提交锁掉。静默成功是最坏的情况：QA 以为结果进去了，实际上一条都没写。
   服务端的拒绝理由原样透传，不要让 SDK 自己编一句概括。
5. **不做预检**。上一版这里要求跑测试前先调 `GET /ingest/target`，
   随「上报目标」一起删了——归属由用例解析（§3.7），跑之前没有任何需要人确认的配置。
   `GET /ingest/runs` 留着给人排查用，SDK 不在正常路径上调它。

### 7.3 各语言落地形态

| 语言 | 形态 | 附件来源 |
|---|---|---|
| Node.js | wdio reporter + playwright reporter（同一个核心包，两层薄壳） | wdio/playwright 自带的截图与 trace |
| Python | pytest plugin | `pytest-html` 那套 hook 里拿 |
| Java | JUnit5 Extension + TestNG Listener | 用户自己在断言失败时塞 |

**预签名 PUT（D28）在三语言下收益被放大**：三个 SDK 都只需要一个 HTTP 客户端，
谁都不用引 AWS SDK——Java 引一个 S3 SDK 就是给用户的构建加十几兆依赖，还会撞版本。

### 7.4 顺序与发布渠道

建议 **Node → pytest → JUnit**：

- Node 在仓库内，能直接复用 ingest 的 zod 类型，天然是参考实现。
- pytest 次之，plugin 机制最轻。
- JUnit 放最后，但**发布前置现在就要起**：Maven Central 要 sonatype 账号 + GPG 签名 + 域名验证，
  这套流程比写 SDK 本身久得多。npm 与 PyPI 没有这个问题。

---

## 8. 任务包与依赖

```
W1  个人 API Token（全局前置）
     schema/api-tokens.ts + 迁移 + repository
     + Bearer 鉴权中间件（复用 context.ts 的 users 读库）
     + token 管理 UI：独立路由 `/api-tokens`（创建/吊销/明文只显示一次）
              │
              ▼
W2  Ingest 契约 + 端点（第二个瓶颈，三个 SDK 都等它）
     schema/automation-executions.ts + test_run_cases/attachments 增列 + 迁移
     + 归属解析 repository：sourceRef → 候选 run_case 三元组（§5.3 那条 SQL）
       含自动提交结算前置（D36 / §3.8）与按 runId 分组写入（§5.5）
     + executedVia 接进 bulkSetRunCaseResult（含 §3.6 的清除列表）
     + GET /ingest/runs + POST /ingest/executions + 对账单（writtenTo 分组）
     + zod schema 冻结 → 产出 OpenAPI
     注：本期**不新增**任何「上报目标」表，理由见 §3.7
              │
   ┌──────────┴───────────┬────────────────────┐
  W3 附件               W4 报告与执行台        W5 Node SDK
   token presign 路由     失败清单补出处         wdio + playwright
   + 单次执行配额         + 执行记录块（按本任务  （参考实现）
   + R2 未配置降级          聚合，§6.3 那条警告）
                         + 顶部灰字               │
                         + 越界用例一键追加       │
                                    ┌───────────┴──────────┐
                                   W6 pytest plugin      W7 JUnit5 + TestNG
                                                          （Maven Central 前置
                                                            与 W2 并行起）
```

**W1 与 W2 是串行瓶颈**，各自完成并 review 通过后下游才能并行。
W7 的**发布渠道申请与 W2 并行开始**，别等代码写完卡在流程上。

> **W1 落点修正（2026-08-24）**：token 管理 UI 原计划挂在「设置」页，实现时改成了
> 独立路由 `/api-tokens`。理由：`/settings` 是**项目维度**的页面，选定项目之前整页不渲染
> 任何分区（`settings-page.tsx` 的 `NoProjectsNotice`），而个人 token 是**账号维度**的东西。
> 挂在那里会有两个后果：一个项目都还没建的人拿不到自己的 token；每次切项目那个分区都会
> 跟着 `key={projectId}` 白重挂一次。侧栏入口不设角色门槛——每个人都该能管自己的 token。

---

## 9. 验收要点

**Token**

- [ ] token 明文只在创建响应里出现一次，之后任何接口都取不到
- [ ] 库里存的是 SHA-256，不是明文也不是可逆密文
- [ ] 吊销后立即失效，且 `lastUsedAt` 仍可查（行没被删）
- [ ] 账号被停用（`disabledAt`）后，其全部 token 立即失效
- [ ] `lastUsedAt` 一分钟内只写一次（节流生效）

**归属解析与边界（§3.7 / §5.8）**

- [ ] SDK 配置里**只有** token + projectId；端点**不接受** `runId` 作为归属输入（D31）
- [ ] 代码库里**没有** `automation_targets` 之类的「上报目标」表，也没有任务级的接收开关
- [ ] **四个 QA 在同一项目各建各的测试任务，各自跑脚本，结果各自归位**（头号回归用例）
- [ ] **一个人建 5 个模块任务（各含各的模块用例），跑哪个模块的脚本就写进哪个任务，零配置**（头号回归用例）
- [ ] 一条用例同时在两个未提交任务里 → **两个任务都被写入**，不报错、不需要人消歧（D33）
- [ ] 上述情形的对账单 `writtenTo` 有两行，SDK 也打两行（D34）
- [ ] 传 `runIds` 白名单时，只写进白名单内的任务，其余结果进 `outOfScope`
- [ ] 不传 `runIds` 时行为等同于全部候选（它不是必填，不构成每迭代配置）
- [ ] 已提交的任务**不进候选**（选候选时就用 `submitted_at is null` 排除，不靠兜底）
- [ ] **选出候选任务之前跑过自动提交结算**（D36 / §3.8）。回归用例：造一个 `completedAt`
      已超期、且**从未有人打开过任何页面**的任务，直接上报 → 该任务被自动提交且上报被拒，
      而不是被写入。⚠️ `plans/011` 加了每日 03:00 的扫描，它会抢先把这种任务结算掉；
      构造用例时必须让扫描来不及跑（当天 03:00 之后现造，或临时停掉那个 job），
      否则验的是扫描不是 ingest。这条是本期唯一会打破第二期不变式的地方
- [ ] 候选里有「待评审」任务时，**只有那个任务**被跳过并进 `outOfScope`，其余任务照常写入
- [ ] 上报中途某个任务被人提交 → **只有那个任务**回滚，其余任务的结论完整保留
- [ ] 一条用例都没匹配上 → `200` + `writtenTo: []` + 全量 `unmatchedCases`，不是 4xx
- [ ] 没有任何候选任务时**不会**凭空创建测试任务，也没有暂存区（D35）
- [ ] `unmatchedCases` 与 `outOfScope` 是两个独立数组，没有被合并
- [ ] `GET /ingest/runs` 返回未提交任务列表含 `daysSinceLastVerdict`；SDK 正常路径上不调它

**上报**

- [ ] 上报走的是 `bulkSetRunCaseResult`，代码里没有第二条写 `test_run_cases.result` 的路径
- [ ] 上报第一条结论 → 任务自动 `ready → in_progress`；上报补齐最后一条 → 自动 `completed`
- [ ] 「待评审」的任务上报被拒，错误信息明确
- [ ] `submitted` 的任务上报被拒，拒绝发生在 repository 事务内（非端点预检）
- [ ] 同一个 `idempotencyKey`（已完成的那一轮）重复提交不报错，返回缓存对账单，不产生第二行 execution
- [ ] `completedAt is null` 的那一轮重试时整轮重跑，且重跑不在 `test_run_case_events` 里
      留下 `passed → passed` 之类的空流水
- [ ] `automation_executions` 挂在 `projectId` 上，**没有** `runId` 列（§3.2）
- [ ] `overwriteManual = false`（默认）时，已有人工结论的行被跳过并列进对账单，
      且 `skippedManual` 条目带 `runName`（同一条 sourceRef 可能在 A 写入、在 B 被跳过）
- [ ] `overwriteManual = true` 时覆盖，且 `test_run_case_events` 有流水可查
- [ ] 未匹配 / 越界的 sourceRef 逐条列出，**没有任何一条被静默丢弃**
- [ ] 越界用例不会被自动追加进测试任务
- [ ] 单个任务的那一组结论与其 `lastAutomationExecutionId` 回填在同一事务内
      （人为制造失败后该组一起回滚，且不影响其他任务那几组）
- [ ] 200 条以上分批，服务端不出现逐条抢 `FOR UPDATE` 的串行往返
- [ ] 候选任务数为 N 时，写入事务数为 N，**不是**逐条一个事务

**数据完整性**

- [ ] 回退结论到 `untested` 时，`executedVia` 与 `lastAutomationExecutionId` **一并清空**（§3.6）
- [ ] `test_cases` 上**没有**新增任何「执行方式」列（D19）
- [ ] 「自动化覆盖率」若要展示，是从 `executedVia` 历史查出来的，不是读某个标记列

**附件**

- [ ] token 走的 presign 路由可用，写入 `uploadedVia = 'automation'`
- [ ] 一条结果写进两个任务时，两边**各有一份**附件行与各自的 object（不共享 storageKey）
- [ ] 配额按单个任务计；横跨三个任务的执行不会让每个任务的配额缩水
- [ ] 单次执行超过条数或总字节配额时被拒，且理由进对账单
- [ ] R2 未配置时，结论照常上报成功，只有附件部分降级

**报告**

- [ ] 通过率、完成率的算法与第二期完全一致（分母仍不含阻塞与跳过）
- [ ] 报告顶部**没有**手工/自动化两套率
- [ ] 失败清单里脚本报的行能看到 branch / commit，有 `ciUrl` 时可点击
- [ ] 失败清单的新增字段走同一条查询，报告页 SQL 次数与第二期持平（无 N+1）
- [ ] 执行记录块显示跳过条数，位置在失败清单之后
- [ ] **执行记录块的「刷新 N 条」是本任务的条数**，不是 `automation_executions.updatedCount`
      （构造一次横跨两个任务的执行，两边报告各显示各的条数）
- [ ] `completedAt is null` 的执行在记录块里被标为未完成，不当作完整一轮展示
- [ ] 报告仍无任何快照机制
- [ ] 横跨 N 个任务的一次上报，发出 N 条 `entity: "testRun"` 失效事件（§5.7）

**SDK（每个语言各验一遍）**

- [ ] 批量提交，不逐条
- [ ] 重试复用同一个幂等键
- [ ] 对账单三类拒绝原样打印，`writtenTo` 按任务逐行打印
- [ ] `writtenTo` 为空时显式报错且退出码非零（服务端拒绝理由原样透传，不自行概括）
- [ ] **不调任何预检接口**；正常路径只有一次 `POST /ingest/executions`
- [ ] 附件上传只依赖 HTTP 客户端，没有引入 S3 SDK

**全局**

- [ ] `pnpm check-types` + `pnpm dlx ultracite check` 全绿
