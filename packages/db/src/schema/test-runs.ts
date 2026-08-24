import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { projects } from "./projects";
import { testCases } from "./test-cases";
import { users } from "./users";

/**
 * 测试任务状态机（plan §2）。
 *
 * ```
 * pending_review ⇄ ready ──> in_progress ⇄ completed ──> submitted（终态，锁死）
 * ```
 *
 * 枚举顺序即业务顺序，新状态必须追加在语义上的正确位置而不是数组末尾。
 *
 * `in_progress` 与 `completed` 都由 repository 在打结论的同一事务里自动推进，
 * 不给用户手动改状态的入口——手动状态和结果统计一旦能各走各的，就必然对不上。
 * 只有 `pending_review → ready` 和 `completed → submitted` 是人工的：
 * 评审在线下开会完成（D4），平台无从判断会开完了没有；提交则是人对报告的确认。
 *
 * **`completed` 不是终态，也不是只读**：`completed` 的测试任务仍然可以直接改结论，
 * 没有「重新打开」这个动作要先点——用户要的是无阻力地改。任何让任务里重新出现
 * `untested` 行的操作都在同一事务里把任务退回 `in_progress` 并把 `completedAt`
 * 置 null，改完最后一条又自动回到 `completed`。把状态做成「结果的函数」而不是
 * 一个要人维护的开关，是这两个状态之间唯一不会对不上账的做法。
 * 反过来 `in_progress → ready` 不可退——`startedAt` 已经记下「曾经开测」
 * 这个事实，抹掉它就是伪造历史。
 * 这条往返正是 `test_run_events` 存在的理由（见文件末尾）。
 *
 * **`submitted` 是唯一终态，进入后不可逆**：结论、说明、附件、人工填的
 * `defectUrl` 全部冻结，要改只能新建重测任务（D11）。
 * 「完成前完全自由、提交后绝对冻结」这两件事必须同时成立，才既不会因为
 * 怕改不了而不敢完成，也不会让交出去的报告事后被人悄悄改数。
 *
 * 冻结有且只有一个例外：`test_run_cases.defectStatus` 仍可由 Jira webhook 更新。
 * 那是外部系统的**当前事实**，不是报告内容。三个月后打开一个已提交的测试任务，
 * 需要看到当时失败的 8 条里有 6 条 Jira 已经解决，才能判断「可以开重测任务了」；
 * 把它一起冻住会让这个测试任务变成一份没人再打开的死数据。
 */
export const testRunStatusEnum = pgEnum("test_run_status", [
	"pending_review",
	"ready",
	"in_progress",
	"completed",
	"submitted",
]);

/**
 * 单条用例在测试任务里的结论（D5）。
 *
 * `blocked` / `skipped` 是逃生口：环境挂了、依赖没就绪的用例必须能标记，
 * 否则测试任务永远关不掉，最后大家会乱打 `passed` 把它糊过去，数据就废了。
 * 也正因为它们不代表「测过并且合格」，通过率的分母只算 passed + failed（plan §2）。
 */
export const testRunCaseResultEnum = pgEnum("test_run_case_result", [
	"untested",
	"passed",
	"failed",
	"blocked",
	"skipped",
]);

/**
 * 附件分类。表本身在 `schema/test-run-attachments.ts`（叶子表，单独成文件），
 * 枚举留在这里与另外两个 pgEnum 一起充当跨包共享的词汇表：
 * `apps/web` 与 `packages/api` 都从 `@automationstack/db/schema/test-runs`
 * 取 `TestRunAttachmentKind`。
 */
export const testRunAttachmentKindEnum = pgEnum("test_run_attachment_kind", [
	"screenshot",
	"video",
	"log",
	"other",
]);

export type TestRunStatus = (typeof testRunStatusEnum.enumValues)[number];
export type TestRunCaseResult =
	(typeof testRunCaseResultEnum.enumValues)[number];
export type TestRunAttachmentKind =
	(typeof testRunAttachmentKindEnum.enumValues)[number];

export const testRuns = pgTable(
	"test_runs",
	{
		/**
		 * 最后一条用例拿到结论的时刻，与 status='completed' 同事务写入；
		 * 测试任务被重新打开时置回 null。**这是个会被覆盖的单值字段**，
		 * 「第一次是什么时候完成的」要去 `test_run_events` 查。
		 *
		 * 它同时是自动提交的计时起点（天数见 `schema/project-settings.ts` 的
		 * `projectSettings.autoSubmitAfterCompletedDays`，未配置时兜底
		 * `DEFAULT_AUTO_SUBMIT_AFTER_COMPLETED_DAYS`）：
		 * 重开时置 null 会让倒计时一并归零，再次完成时重新开始。
		 */
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/** 删账号不该把测试任务一起带走：历史报告必须可复现，故 set null。 */
		createdBy: uuid("created_by").references(() => users.id, {
			onDelete: "set null",
		}),
		description: text("description"),
		id: uuid("id").primaryKey().defaultRandom(),
		name: text("name").notNull(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		/** 推进到「待测试」的时刻。 */
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
		/**
		 * 谁把测试任务推进到「待测试」。评审本身在线下开会完成，平台不记逐条 verdict（D4），
		 * 那么「谁签的字」就是唯一还能留下的评审痕迹，不能省。
		 */
		reviewedBy: uuid("reviewed_by").references(() => users.id, {
			onDelete: "set null",
		}),
		/** 首条结论的时刻，与 status='in_progress' 同事务写入。 */
		startedAt: timestamp("started_at", { withTimezone: true }),
		status: testRunStatusEnum("status").notNull().default("pending_review"),
		/**
		 * 报告被提交、测试任务被永久锁死的时刻。非空即代表已锁死，
		 * 与 `status='submitted'` 同事务写入，二者不允许出现分歧
		 * （由 `test_runs_submitted_consistency` 这条 CHECK 强制）。
		 *
		 * **超时自动提交没有定时任务，是读路径上的惰性结算。**
		 * `list` / `get` / `report` 进入时就地结算命中的测试任务：
		 *
		 * ```sql
		 * status = 'completed' AND submitted_at IS NULL
		 *   AND completed_at < now() - (coalesce(ps.auto_submit_after_completed_days, 3) || ' days')::interval
		 * ```
		 *
		 * 结算时 `submittedBy` 留 null，并补一条 `test_run_events`。
		 * 惰性的代价是没人访问就不翻状态；但报告页本身就是访问点，
		 * 用户能看到的永远是已结算后的状态，不存在「看到一个本该锁死却还开着的测试任务」。
		 * 不引定时任务框架换来的是：没有一个需要单独部署、监控、补跑的活动部件。
		 */
		submittedAt: timestamp("submitted_at", { withTimezone: true }),
		/**
		 * 提交人。**`submittedAt IS NOT NULL AND submittedBy IS NULL` 表示
		 * 超时自动提交**（惰性结算写的，没有操作人），这是本字段唯一的
		 * 「空值有含义」场景——报告页据此区分「张三确认过」和「没人管，三天后自己锁的」，
		 * 这两件事对读报告的人来说可信度完全不同。
		 *
		 * ⚠️ **本字段的 null 承载语义，因此它不能被别的原因写成 null。**
		 * 当前代码库没有任何删除用户的路径，`set null` 永不触发，所以这里没有问题。
		 * 将来若要引入删除用户的能力，**必须走软删除**（保留 `users` 行，
		 * 用 `disabledAt` 之类的标记停用）——`users.disabledAt` 本来就是为此存在的。
		 * 如果真的必须硬删用户，那么在动手的同一次改动里，就得先把「是否自动提交」
		 * 提升为一个独立字段，否则每一份被删账号提交过的报告都会**静默地**
		 * 从「张三确认过」变成「没人管自己锁的」——数字不变，可信度被悄悄改写，
		 * 而且没有任何地方会报错。
		 */
		submittedBy: uuid("submitted_by").references(() => users.id, {
			onDelete: "set null",
		}),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		// 列表页只有两种查法：按项目 + 状态筛选，以及按项目倒序翻最近的测试任务，
		// 两个复合索引各覆盖一种，避免退化成全表扫描后排序。
		index("test_runs_project_id_status_idx").on(table.projectId, table.status),
		index("test_runs_project_id_created_at_desc_idx").on(
			table.projectId,
			table.createdAt.desc()
		),
		// `status='submitted'` ⇔ `submitted_at IS NOT NULL`，两者必须同真同假。
		//
		// 这个不变量是整份报告可信度的地基：`submittedAt` 非空是「已锁死、不可再改」
		// 的判据，`status` 是界面上显示的东西，一旦分歧，就会出现「界面显示已提交、
		// 写路径却认为还能改」这种最坏情况——而且不会有任何地方报错。
		// W2 会有四五条写路径能碰这两个字段（人工提交、惰性结算、重开、重测任务），
		// 注释约束不住这么多入口，只有 CHECK 是每条路径都绕不过去的。
		//
		// 提交是 `UPDATE ... SET status='submitted', submitted_at=now()
		// WHERE submitted_at IS NULL` 一条语句写完两个字段；CHECK 是行级、
		// 语句末尾求值，看到的是两个字段都已更新后的行，不会误伤。
		check(
			"test_runs_submitted_consistency",
			sql`(${table.status} = 'submitted') = (${table.submittedAt} is not null)`
		),
	]
);

export type TestRun = typeof testRuns.$inferSelect;
export type NewTestRun = typeof testRuns.$inferInsert;

/**
 * 测试任务的用例行：**范围与结果合一**，一条用例在一个测试任务里只出现一次。
 *
 * 不拆「范围表 + 结果表」是因为二者一一对应且同生共死，拆开只会带来
 * 「有结果但不在范围里」的脏状态，以及每次查询都要多一次 join。
 */
export const testRunCases = pgTable(
	"test_run_cases",
	{
		assigneeId: uuid("assignee_id").references(() => users.id, {
			onDelete: "set null",
		}),
		/**
		 * `restrict` 而不是 `cascade`（plan §3.4）：若用 cascade，删一条用例会让所有
		 * 历史测试任务里对应的结果行**静默消失**，已完成任务的统计数字会自己变化，
		 * 报告不可复现。删除入口改为在 repository 层先查引用数并返回类型化拒绝结果，
		 * 引导用户把用例改成 `deprecated`——那才是正确的软删除出口。
		 */
		caseId: uuid("case_id")
			.notNull()
			.references(() => testCases.id, { onDelete: "restrict" }),
		/**
		 * 打结论那一刻的 `test_cases.currentVersion`（plan §3.3）。
		 *
		 * **这不是锁版本**：用例是活引用，详情页永远 join 最新版（D2），UI 上没有
		 * 任何版本选择控件。它只回答一个事后问题——「这条 8 月 12 号为什么失败，
		 * 我现在看用例根本没这个步骤」：有它能一秒答出当时执行的是 v3、现在是 v7，
		 * 并用第一期已有的 `case_versions` 做 diff。没有它，有历史也不知道该对哪一版。
		 * 未打结论时为 null。
		 */
		caseVersion: integer("case_version"),
		/** 失败原因 / 阻塞原因。 */
		comment: text("comment"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/** Jira issue key，如 "PAY-123"。未配置 Jira 的项目恒为 null（D9）。 */
		defectKey: text("defect_key"),
		/** Jira 状态快照，由 webhook 更新；它回答「哪些 bug 修好了、可以开重测任务了」。 */
		defectStatus: text("defect_status"),
		defectTitle: text("defect_title"),
		/** 未配置 Jira 时，这里存用户手填的纯文本 URL——优雅降级的落点（D9）。 */
		defectUrl: text("defect_url"),
		executedAt: timestamp("executed_at", { withTimezone: true }),
		executedBy: uuid("executed_by").references(() => users.id, {
			onDelete: "set null",
		}),
		id: uuid("id").primaryKey().defaultRandom(),
		result: testRunCaseResultEnum("result").notNull().default("untested"),
		runId: uuid("run_id")
			.notNull()
			.references(() => testRuns.id, { onDelete: "cascade" }),
		sortOrder: integer("sort_order").notNull().default(0),
	},
	(table) => [
		// 同一条用例在一个测试任务里只能出现一次：addCases 重复勾选时直接由数据库挡下，
		// 而不是靠应用层「先查再插」——并发下那会插出两行。
		unique("test_run_cases_run_id_case_id_uq").on(table.runId, table.caseId),
		// 执行台按结论筛选清单，报告页按结论聚合，都走这个索引。
		index("test_run_cases_run_id_result_idx").on(table.runId, table.result),
		// 用例详情页要看这条用例跨测试任务的执行历史，最近的排前面。
		index("test_run_cases_case_id_executed_at_desc_idx").on(
			table.caseId,
			table.executedAt.desc()
		),
	]
);

export type TestRunCase = typeof testRunCases.$inferSelect;
export type NewTestRunCase = typeof testRunCases.$inferInsert;
