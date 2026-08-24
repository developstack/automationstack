/**
 * 用例结论变更审计流水表。
 *
 * 与 `schema/test-run-events.ts` 同理，作为 `test_run_cases` 的叶子表拆出来：
 * 它只向上引用 `testRunCases` / `testRunCaseResultEnum` / `users`，
 * `schema/test-runs.ts` 不引用它，依赖方向单一，不构成模块循环。
 * （`pgEnum` 在模块求值期就要取到值，父子表互相 import 会踩 TDZ 崩在启动那一刻。）
 */

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { testRunCaseResultEnum, testRunCases } from "./test-runs";
import { users } from "./users";

/**
 * 用例结论变更审计流水：**只插入，永不更新、永不删除**。
 *
 * `test_run_events` 之于测试任务状态，就是本表之于用例结论。为什么不能只靠
 * `test_run_cases` 上的 `result` / `executedBy` / `executedAt` / `comment`：
 * 那四个都是**单值字段**。结论可以被反复改写——张三判通过、李四打回未测、
 * 王五判失败——每一次覆盖都把上一次的操作人和时刻抹得干干净净，最后只剩
 * 「王五，失败」。于是「这条用例第一次是谁判通过的、几点判的、谁把它打回去的、
 * 打回时他写的失败原因是什么」全部无从回答。而这恰恰是缺陷追责与回归复盘时
 * 唯一要问的问题。
 *
 * 用 `fromResult` / `toResult` 两列而不是一个事件类型枚举，理由同 `test_run_events`：
 * 往结论枚举里加值时不必再维护第二套跟着走的枚举，也不会出现
 * 「事件类型说『打回』、结论却对不上」的两套真相。
 */
export const testRunCaseEvents = pgTable(
	"test_run_case_events",
	{
		/** 操作人。删账号不能带走审计流水，故 set null（署名丢了，事实还在）。 */
		actorId: uuid("actor_id").references(() => users.id, {
			onDelete: "set null",
		}),
		/**
		 * 本次变更**当时**那段说明文字的快照，不是对 `test_run_cases.comment` 的引用。
		 *
		 * 快照才答得出「他当时为什么判失败」：`test_run_cases.comment` 是活值，
		 * 后面任何一次改写（尤其是打回未测会把它整段清成 null）都会让引用式的
		 * 历史跟着一起变，报告里那句「支付超时，订单状态没回滚」就凭空消失了。
		 * 打回未测那条流水记的正是**被清掉之前**的那段文字——它是这次打回的证据本身。
		 */
		comment: text("comment"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/**
		 * 来源结论。与 `test_run_events.fromStatus` 不同，这里 **notNull**：
		 * run_case 行一建出来就是 `untested`，不存在「没有来源态」的第一条事件。
		 */
		fromResult: testRunCaseResultEnum("from_result").notNull(),
		id: uuid("id").primaryKey().defaultRandom(),
		/**
		 * 级联删除：这条流水依附的是「这条用例在这个测试任务里」这层关系本身，
		 * 用例被移出测试任务时，它在那个任务里的结论历史也就没有主语了。
		 * （注意与 `test_run_cases.caseId` 的 `restrict` 不冲突：那条外键护的是
		 * 「删用例不能让历史报告的数字静默变化」，与本表无关。）
		 */
		runCaseId: uuid("run_case_id")
			.notNull()
			.references(() => testRunCases.id, { onDelete: "cascade" }),
		toResult: testRunCaseResultEnum("to_result").notNull(),
	},
	// 唯一的读法是「这条用例的时间线，最近的在前」。
	(table) => [
		index("test_run_case_events_run_case_id_created_at_desc_idx").on(
			table.runCaseId,
			table.createdAt.desc()
		),
	]
);

export type TestRunCaseEvent = typeof testRunCaseEvents.$inferSelect;
export type NewTestRunCaseEvent = typeof testRunCaseEvents.$inferInsert;
