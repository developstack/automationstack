import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

import { automationExecutions } from "./automation-executions";
import { projects } from "./projects";
import { testCases } from "./test-cases";
import {
	type RunCaseStepResult,
	testRunCaseResultEnum,
	testRunExecutedViaEnum,
	testRunStatusEnum,
} from "./test-run-enums";
import { users } from "./users";

export type {
	RunCaseStepResult,
	TestRunAttachmentKind,
	TestRunCaseResult,
	TestRunExecutedVia,
	TestRunStatus,
	TestRunStepResult,
} from "./test-run-enums";
/**
 * 测试任务链路的两张主表：`test_runs`（任务本身）与 `test_run_cases`
 * （范围与结果合一的用例行）。
 *
 * 四个跨包共享的 pgEnum 及其字面量类型拆去了 `schema/test-run-enums.ts`
 * ——纯粹为了让本文件回到 300 行以内，分组语义一个字没改——并在下面原样
 * re-export：`@automationstack/db/schema/test-runs` 这条导入路径上此前能取到的
 * 每一个符号仍然在原处，`apps/web` 与 `packages/api` 的十几处 import 一处都不用动。
 */
// biome-ignore lint/performance/noBarrelFile: 兼容性 re-export，不是 barrel——这四个枚举本来就定义在本文件里，拆去 test-run-enums.ts 只为行数上限，导入路径必须保持不变
export {
	testRunAttachmentKindEnum,
	testRunCaseResultEnum,
	testRunExecutedViaEnum,
	testRunStatusEnum,
} from "./test-run-enums";

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
		/**
		 * 这条结论是人打的还是脚本打的（plan §3.3）。
		 *
		 * **可空，且 null 有含义**：未测的行没有执行方式。所以分布上天然是三个桶——
		 * 手工 / 自动化 / 未测，任何按来源的统计都必须显式处理第三个桶，
		 * 而不是把 null 归进「手工」。
		 */
		executedVia: testRunExecutedViaEnum("executed_via"),
		id: uuid("id").primaryKey().defaultRandom(),
		/**
		 * 最后一次写这条结论的自动化执行，报告里据此回链到 CI（§6.3）。
		 *
		 * `set null` 而不是 `restrict`：执行记录是辅助材料，将来清理老记录
		 * 不该被结论行卡住——`restrict` 会让「删三个月前的执行记录」这种运维动作
		 * 撞上一堆历史结论行而根本做不成。断了链接最多是失去一条 CI 链接，
		 * 结论本身（result / comment / 附件）一个字都不动。
		 * 这跟 `caseId` 那条 `restrict` 不冲突：那里断链会让统计数字静默改变。
		 */
		lastAutomationExecutionId: uuid("last_automation_execution_id").references(
			() => automationExecutions.id,
			{ onDelete: "set null" }
		),
		result: testRunCaseResultEnum("result").notNull().default("untested"),
		runId: uuid("run_id")
			.notNull()
			.references(() => testRuns.id, { onDelete: "cascade" }),
		sortOrder: integer("sort_order").notNull().default(0),
		/**
		 * 分步判定结果，每个元素对应用例的一个步骤。
		 *
		 * **`result` 是这一列的函数**（`deriveCaseResult`，
		 * 见 `repositories/test-run-step-results-core.ts`），不是一个可以各走各的
		 * 独立字段。所以这里没有「用例判通过、第 3 步却标着失败」这种状态——
		 * 那正是本列存在的意义：把用例结论做成分步结果的函数，
		 * 与 `test_runs.status` 做成用例分布的函数是同一条原则。
		 * 每一条写路径都必须同事务地同时写这两列，只写一列的代码一律是错的。
		 *
		 * 空数组 ⇔ `result = 'untested'`（对**有步骤**的用例而言）。回退成未测时
		 * 连它一起清空，理由与 `buildResultPatch` 清 comment 那条完全相同。
		 * 没有步骤的用例恒为空数组，结论仍由人直接点四颗按钮——本列不适用。
		 *
		 * ⚠️ **例外只有一类：分步判定上线之前就已经打过结论的历史行**——迁移
		 * `0011` 给它们的默认值是 `[]`，于是这些行 `result` 非 untested 而本列为空。
		 * 刻意**不回填**：把「用例判过通过」摊成「每一步都通过」是在替当时的人
		 * 声称一件他没说过的事（他可能压根没走完每一步）。执行台把这类行显示成
		 * 「分步判定上线前打的结论，没有分步记录」，重判一次就自然补上。
		 * 新写入的每一行都必须满足上面那条不变式。
		 *
		 * 存 jsonb 而不是另开一张 `test_run_case_steps` 表：步骤本身就存在
		 * `test_cases.steps` 这个 jsonb 里，步骤 id 无论如何都没有外键可依。
		 * 建一张表只会造出「看起来有引用完整性、其实没有」的错觉，还要多一次
		 * join 和一套删用例时的清理逻辑。而读路径永远是「这一行的这些步骤」，
		 * 从来不需要跨用例按步骤聚合。
		 */
		stepResults: jsonb("step_results")
			.$type<RunCaseStepResult[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
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
