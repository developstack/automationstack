/**
 * 测试任务状态流转审计流水表。
 *
 * 与 `schema/test-run-attachments.ts` 同理，作为 `test_runs` 的叶子表拆出来：
 * 它只向上引用 `testRuns` 与 `testRunStatusEnum`，`schema/test-runs.ts` 不引用它，
 * 依赖方向单一，不构成模块循环。
 */

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { testRunStatusEnum, testRuns } from "./test-runs";
import { users } from "./users";

/**
 * 测试任务状态流转审计流水：**只插入，永不更新、永不删除**。
 *
 * 为什么不能只靠 `test_runs` 上的 `reviewedBy` / `reviewedAt` / `completedAt`：
 * 那三个都是**单值字段**。状态机支持「已完成 → 重新打开 → 再次完成」的往返，
 * 单值字段会被反复覆盖，于是「这个测试任务第一次是什么时候完成的、谁重开的、
 * 为什么重开」全部丢失。如果有人基于第一次完成时的报告做了上线决策，
 * 后来数字变了，将无从追溯——而这恰恰是最需要追溯的场景。
 *
 * 用 `fromStatus` / `toStatus` 两个状态列而不是一个事件类型枚举：
 * 以后往状态机里加状态时，不必再改一个跟着状态走的第二套枚举，
 * 也不会出现「事件类型说 reopen、状态却对不上」的两套真相。
 */
export const testRunEvents = pgTable(
	"test_run_events",
	{
		/** 操作人。删账号不能带走审计流水，故 set null（署名丢了，事实还在）。 */
		actorId: uuid("actor_id").references(() => users.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		/** 新建测试任务那条事件没有来源状态，故可空。 */
		fromStatus: testRunStatusEnum("from_status"),
		id: uuid("id").primaryKey().defaultRandom(),
		/** 重新打开等需要解释的流转填在这里；常规自动流转为 null。 */
		reason: text("reason"),
		runId: uuid("run_id")
			.notNull()
			.references(() => testRuns.id, { onDelete: "cascade" }),
		toStatus: testRunStatusEnum("to_status").notNull(),
	},
	// 唯一的读法是「某个测试任务的时间线，最近的在前」。
	(table) => [
		index("test_run_events_run_id_created_at_desc_idx").on(
			table.runId,
			table.createdAt.desc()
		),
	]
);

export type TestRunEvent = typeof testRunEvents.$inferSelect;
export type NewTestRunEvent = typeof testRunEvents.$inferInsert;
