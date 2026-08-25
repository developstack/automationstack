/**
 * 一次「跑脚本上报」的上下文（plan §3.2）：一次上报一行。
 *
 * ## 为什么挂在 `projectId` 上，而不是挂在测试任务上
 *
 * 一次执行完全可能同时写进多个测试任务（§3.7 D33）。若这里写成
 * `runId notNull`，「一次执行 = 一个测试任务」这条假设就在第一天被焊死：
 * 之后要么把一次执行拆成 N 行——幂等键当场失效，重放会写出 N 份新记录；
 * 要么从被写入的任务里随便挑一个记上去——那记的是假话，报告里点开就是错的链接。
 * 挂在项目上则两种脏路都不存在：执行是项目级的事实，任务级的关联由
 * `test_run_cases.lastAutomationExecutionId` 反查，那本来就是真相所在，
 * 多存一张关联表只是多一个会漂的副本。
 *
 * ## 这张表是「解释性材料」，不是结论
 *
 * 它只被报告里的执行记录块（§6.3）读，不参与任何统计口径。
 * `skippedCount` / `updatedCount` 是**全局**冗余计数——跨这一轮所有被写入的
 * 测试任务累加，只为让「我上次那轮跑了多少条」一条 SQL 出完。
 * ⚠️ **任何按测试任务的数字都必须回 `test_run_cases` 现算，不许读这两列**：
 * 一次跨三个任务的执行，这两列对其中任何单个任务都是虚高的，
 * 拿去当分子分母不会报错，只会让报告静默地数错。
 *
 * ## 唯一的例外：`receipt`
 *
 * 「这一轮当时返回给上报方的那份对账单」原样存在 `receipt` 列里，
 * 它**不是**上面拒掉的那张关联表——那是当前状态的副本（会漂），
 * 这是历史陈述的记录（本就不该变）。区别与理由写在该列自己的注释上。
 *
 * ## 依赖方向
 *
 * 本文件只向上引用 `./projects` 与 `./users`，**绝不 import `./test-runs`**。
 * 反向的那条边已经存在（`test_run_cases.lastAutomationExecutionId` 引用本表），
 * 再加一条就成环；pgEnum 在模块求值期取值，schema 成环会直接炸在 TDZ 上
 * （原委见 `test-run-attachments.ts` 顶部）。
 */

import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { projects } from "./projects";
import { users } from "./users";

export const automationExecutions = pgTable(
	"automation_executions",
	{
		branch: text("branch"),
		/** CI 里跑才有链接，本机跑就是 null——报告里那条「去看这次跑的日志」全靠它。 */
		ciUrl: text("ci_url"),
		commitSha: text("commit_sha"),
		/**
		 * 服务端把这一轮全部写完才落。
		 * 与 `finishedAt` 不是一回事：那是脚本自己报的结束时间，
		 * 落到这里之前还要过网络和一整个写事务。
		 * null = 这一轮没跑完（进程被杀、事务回滚），幂等重放据此判断能否接着写（§5.5）。
		 */
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/** SDK 报的脚本结束时间，来自客户端时钟，只做展示，不参与任何判断。 */
		finishedAt: timestamp("finished_at", { withTimezone: true }),
		id: uuid("id").primaryKey().defaultRandom(),
		/**
		 * SDK 生成（§5.2）。同一轮执行重试上报时带同一个键，
		 * 由下面那条唯一约束把重复挡在数据库，而不是靠应用层「先查再插」。
		 */
		idempotencyKey: text("idempotency_key").notNull(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		/**
		 * 这一轮**当时返回给上报方的那份对账单**，原样存下（§5.2 的「缓存的对账单」）。
		 *
		 * ## 它不是 §3.2 拒掉的那张关联表
		 *
		 * §3.2 拒绝的是「另存一张*执行 → 测试任务*关联表」，理由是那是
		 * **当前状态的一个会漂的副本**：某条结论后来被另一轮执行覆盖了，
		 * 指针就该跟着走，副本却不会——于是副本开始说假话。
		 *
		 * 这一列存的是另一种东西：**「我们当时对调用方说过的话」的不可变记录**。
		 * 它本来就不该随后续覆盖而变化，因为重放的语义正是「把上次那句话再说一遍」。
		 * 反过来，用 `test_run_cases.lastAutomationExecutionId` 反查来**重算**这份
		 * 对账单是错的，两条实测后果：
		 * 1. 另一轮执行覆盖了同一批行之后，重放旧键会反查出 0 行、`writtenTo` 为空，
		 *    而 §7.2 第 4 条明写「`writtenTo` 为空要显式报错、退出码非零」——
		 *    一次纯网络重试就能制造一次假的构建失败；
		 * 2. `skippedManual` / `unmatchedCases` / `outOfScope` 记的是「这一轮**没**
		 *    发生什么」，库里根本没留下这一半，重算只能给空数组，
		 *    于是「有 1 条用例不在任何任务里」这个信号被一次重试吞掉。
		 *
		 * 「这次执行**现在**还占着哪些行」仍然只由指针列回答（§3.2 原样有效），
		 * 那是报告页（§6.3）问的问题，与本列回答的「当时说了什么」是两个问题。
		 *
		 * 可空：0009 之前写下的历史行没有这一列的值。读取方必须对 null
		 * 有确定的降级行为，不许假设它非空（见 `execution-ingest.ts` 的 `cachedReceipt`）。
		 * 形状由 `packages/api` 的 `ingestExecutionReceiptSchema` 定义并在读回时校验；
		 * db 层刻意不给它类型——契约属于 api 层，db 只负责原样存取。
		 */
		receipt: jsonb("receipt"),
		/**
		 * 上报所用 token 的主人。`set null` 而非 cascade：删账号不该让历史执行记录
		 * 连同报告里的那条链接一起消失——记录本身仍是有效的解释性材料。
		 */
		reportedBy: uuid("reported_by").references(() => users.id, {
			onDelete: "set null",
		}),
		/** 因 `overwriteManual=false` 而跳过的条数。**全局**冗余计数，见文件头。 */
		skippedCount: integer("skipped_count").notNull().default(0),
		startedAt: timestamp("started_at", { withTimezone: true }),
		/** 实际写进去的条数。**全局**冗余计数，见文件头。 */
		updatedCount: integer("updated_count").notNull().default(0),
	},
	(table) => [
		// 幂等的落点：同一项目内同一个键只可能有一行。
		// 键由客户端生成，跨项目撞车无所谓，所以是复合唯一而不是单列唯一。
		unique("automation_executions_project_id_idempotency_key_uq").on(
			table.projectId,
			table.idempotencyKey
		),
		// 唯一的列表查法：某项目最近的几次执行，倒序。
		index("automation_executions_project_id_created_at_desc_idx").on(
			table.projectId,
			table.createdAt.desc()
		),
	]
);

export type AutomationExecution = typeof automationExecutions.$inferSelect;
export type NewAutomationExecution = typeof automationExecutions.$inferInsert;
