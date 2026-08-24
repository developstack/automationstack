# 011 — pg-boss 基建 + 测试报告每日自动提交扫描

> 基线 commit：`cd89ea2`。
> ⚠️ 工作区存在**其他未提交 WIP**（`apps/web/src/components/cases/*` 与
> `apps/server/src/index.ts` 的 +8 行）。执行者**不得**改动、还原、提交这些文件；
> 本计划对 `index.ts` 只做**纯增量追加**，改完后 `git diff` 里那 8 行 WIP 必须原样存在。
> **执行者不执行任何 git commit / stash / checkout**，改完留在工作区由人审。

## 1. 背景与动机

「完成后 N 天未提交则自动提交」（phase2 D16）目前只有**读路径惰性结算**：
`packages/db/src/repositories/test-run-auto-submit-repository.ts` 在列表 / 详情 /
报告页入口就地跑幂等 UPDATE。文档已承认其唯一短板：**零访问则状态永远不翻**。

用户决策：引入 pg-boss（也为后续后台任务铺基建），加**每日一次定时扫描**兜底，
并明确否决「每任务一个 singleton job」方案（下 §2）。

## 2. 决策记录

- **D1 调度形态：全局每日扫描，不是每任务 job。** 判定条件
  `completed_at < now() - N天` 在**执行时**从当前数据现算：
  - 重测退回 `in_progress` 时 `completedAt` 置 null（现有状态推导机行为）→
    `WHERE status='completed'` 不成立，天然免疫，无需任何「取消」逻辑；
  - 项目设置改天数 → 下次扫描实时读 `COALESCE(...)`，无需重排。
- **D2 精度：天级足够。** 条件是累积式（`<`），停机错过一天次日自然补上。
- **D3 现有惰性结算一行不动。** 三层防御：
  读路径惰性（秒级，有人看时）+ 定时扫描（天级，零访问兜底）+ 幂等 UPDATE 守卫
  （两层并发安全，谁先到谁赢，输者更新 0 行）。
- **D4 pg-boss 建表走它自己的 `pgboss` schema，`boss.start()` 自动迁移**，
  不进 drizzle migrations，drizzle schema 目录不感知它。
- **D5 调度时刻：每日 03:00（默认 `Asia/Shanghai`）**，时刻本身无业务含义，
  仅错峰；cron 与时区均可经 env 覆盖。
- **D6 本期不做副作用**（通知 / Jira 同步），handler 只结算 + 日志。

## 3. 改动清单（4 个任务，串行）

### T1 `packages/db`：全局结算入口

文件：`packages/db/src/repositories/test-run-auto-submit-repository.ts`

- 新增导出 `settleAutoSubmitAll(): Promise<string[]>`：
  复用现有私有 `settleAutoSubmit(tx, scope)`，scope 传 `sql\`true\``。
- 现有 `settleAutoSubmitForProject` / `settleAutoSubmitForRun` **不动**。
- 文件头注释补一段：读路径惰性结算仍是第一层，本入口服务于定时扫描。
- 事件写入、幂等、`submittedBy=null` 语义全部沿用现有实现，不复制 SQL。

### T2 `packages/env`：两个可选变量

文件：`packages/env/src/server.ts`（按现有字母序插入，注释风格向 `PORT` 看齐）

- `AUTO_SUBMIT_SCAN_CRON`：`z.string().min(1).default("0 3 * * *")`
- `AUTO_SUBMIT_SCAN_TZ`：`z.string().min(1).default("Asia/Shanghai")`
  注释说明：D5，时刻无业务含义仅错峰；tz 需为 IANA 名称（pg-boss 要求）。

### T3 `apps/server`：pg-boss 基建模块

新目录 `apps/server/src/jobs/`，两个文件：

**`boss.ts`** — 单例与生命周期：

- `import PgBoss from "pg-boss"`；构造参数 `connectionString: env.DATABASE_URL`，
  `schema: "pgboss"`。**先 `pnpm --filter server add pg-boss`，再对照安装版本的
  typings 确认构造签名 / schedule / work 的确切参数**（v10+ 各版有差异，以
  node_modules 里的 .d.ts 为准，不凭记忆写）。
- 导出 `startJobs()`：`boss.start()` → 注册调度与 worker（T4）→ 返回。
  启动失败 catch 后**记日志并吞掉**（后台任务挂了不该拖死 HTTP 服务，
  与 R2 缺配置时的降级姿势一致）。
- 导出 `stopJobs()`：`void boss.stop()`，幂等，可安全重复调用。

**接线**：`apps/server/src/index.ts` **只做纯增量**（保留现有 WIP 的 8 行）：

- import 两个函数；在 `startRealtime();` 之后加 `void startJobs();`；
- 文件末尾加最小优雅退出：`SIGINT` / `SIGTERM` → `console.log` + `stopJobs()` +
  `process.exit(0)`（该文件此前无 shutdown 处理，保持最小，不引入框架）。

### T4 `apps/server`：每日扫描 job

文件：`apps/server/src/jobs/auto-submit-scan.ts`

- `const JOB_NAME = "test-run-auto-submit-scan"`。
- handler：`const ids = await settleAutoSubmitAll();`，命中时
  `console.log` 数量与 id 列表（跟随 index.ts 现有日志风格），返回。
  handler **不得抛出**：捕获后记日志，pg-boss 会按其重试策略处理。
- 调度注册：`boss.schedule(JOB_NAME, env.AUTO_SUBMIT_SCAN_CRON, undefined, { tz: env.AUTO_SUBMIT_SCAN_TZ })`
  （同名重复 schedule 是幂等更新，每次启动都注册）。随后 `boss.work(JOB_NAME, handler)`。
- 导入路径：`@automationstack/db/repositories/test-run-auto-submit-repository`。

## 4. 非目标

- 不改读路径惰性结算，不做 per-run job，不做提交通知 / Jira 副作用。
- 不加数据库集成测试（本仓库 repository 测试均为纯函数测试，无 DB harness，
  本次改动是纯接线；引入 DB 测试基建是另一个话题）。
- docker-compose 无改动（复用现有 Postgres）。

## 5. 验收标准

1. `pnpm --filter server exec tsc --noEmit`（或 `pnpm check-types`）全绿；
   `pnpm check`（ultracite/biome）、`pnpm lint`、`pnpm test` 全绿。
2. 本地起 db + server，日志可见 pg-boss 启动、`pgboss` schema 自动创建、
   schedule 注册成功。
3. 手工把一条 `completed` 任务的 `completed_at` 改成 4 天前：下一次扫描（或
   临时直接调 `settleAutoSubmitAll()` 的 tsx 一行脚本）后任务变 `submitted`，
   `submittedBy` 为 null，`test_run_events` 多一条 `actorId=null` 记录。
   若本地 db 不可用则此项标记未验证并说明，不得造假。
4. 同一条再扫一次：0 行命中（幂等）。
5. 退回 `in_progress` 的任务永不命中（`WHERE status='completed'` 免疫，代码走查确认即可）。
6. `git diff` 中现有 WIP（含 index.ts 那 8 行）原样保留；无任何 commit 产生。

## 6. 风险

- pg-boss 版本 API 差异 → T3 已要求以安装版 typings 为准。
- `boss.start()` 首次建表需要 DDL 权限；本地 / compose 的 postgres 用户是 owner，成立。
- 与未来多实例部署的互斥（pg-boss 单实例轮询即可，多实例需考虑）→ 本期单实例，不管。
