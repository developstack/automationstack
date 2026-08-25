/**
 * 测试任务附件表（plan §3 / D10）。
 *
 * 从 `schema/test-runs.ts` 拆出来独立成文件：它是这条链路的叶子
 * （`test_runs → test_run_cases → test_run_attachments`），没有任何同目录的
 * 表引用它，因此拆出去不会在 schema 之间形成循环——反过来若把
 * `test_run_cases` 也挪走，`test-runs.ts` 就得回头 import 子表，
 * 而 pgEnum 是模块求值期取值的，循环会直接炸在 TDZ 上。
 *
 * `testRunAttachmentKindEnum` 仍留在 `schema/test-runs.ts`：三个 pgEnum 在那里
 * 集中充当跨包共享的词汇表（`apps/web` 与 `packages/api` 都从
 * `@automationstack/db/schema/test-runs` 引用 `TestRunAttachmentKind`），
 * 把它挪过来会改掉一条跨包 import 路径，换来的只是少一行 import。
 */

import {
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import {
	testRunAttachmentKindEnum,
	testRunCases,
	testRunExecutedViaEnum,
} from "./test-runs";
import { users } from "./users";

export const testRunAttachments = pgTable(
	"test_run_attachments",
	{
		contentType: text("content_type").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdBy: uuid("created_by").references(() => users.id, {
			onDelete: "set null",
		}),
		/**
		 * 上传时的原始文件名，**纯展示用**。
		 *
		 * object key 规则是 `test-runs/{projectId}/{runId}/{runCaseId}/{kind}-{uuid}.{ext}`，
		 * 刻意不含原始文件名（防路径穿越，也避免中文/特殊字符进签名）。
		 * 代价是日志、录屏这类附件在列表里只剩 `log-<uuid>.txt`，
		 * 用户分不清「传的是 nginx 的还是 app 的日志」——截图有缩略图不受影响，日志类没有。
		 * 这一列就是把那个标签补回来。
		 *
		 * ⚠️ **绝不参与 key 生成，绝不用于任何文件系统路径或 URL 路径拼接。**
		 * 这是用户可控的字符串，一旦被拿去拼下载路径，上面特意绕开的那个洞就被重新挖回来了。
		 * 要寻址只有一条路：`storageKey`。
		 *
		 * 与 `storageKey` 的分工：`storageKey` 是唯一的寻址真相，`fileName` 只是给人看的标签，
		 * 两者不保证任何对应关系——同名文件传两次完全合法，会得到两个不同的 key。
		 *
		 * notNull 而非可空：这个值前端在用户选文件时就已经拿到，一定有；
		 * 留空只会让每个展示点都得写一遍 `?? storageKey` 的兜底。
		 */
		fileName: text("file_name").notNull(),
		id: uuid("id").primaryKey().defaultRandom(),
		kind: testRunAttachmentKindEnum("kind").notNull().default("screenshot"),
		runCaseId: uuid("run_case_id")
			.notNull()
			.references(() => testRunCases.id, { onDelete: "cascade" }),
		sizeBytes: integer("size_bytes").notNull(),
		/**
		 * R2 object key，不存完整 URL：访问用的是 15 分钟短期签名 GET URL（D10），
		 * 存下来的完整 URL 过几分钟就是死链，反而比没有更糟。
		 */
		storageKey: text("storage_key").notNull(),
		/**
		 * 这个附件是人传的还是脚本传的（plan §3.4）。
		 *
		 * 复用 `test_run_executed_via`，不另造枚举——问的是同一个问题。
		 *
		 * 它独立成列，而不是用时去 join `test_run_cases.executedVia`：
		 * 上传方与结论来源可以不一致。李四给脚本报的那条失败补了张手工截图，
		 * 结论仍是 `automation`，这张截图却是手工的；join 过去会把它标成脚本产出，
		 * 从而抹掉「有人来看过这条失败」这个恰恰最值得看见的信号。
		 * 可空的含义与 `executedVia` 一致：历史行没有这个信息。
		 */
		uploadedVia: testRunExecutedViaEnum("uploaded_via"),
	},
	// 附件永远是「某条执行结果的附件」，按 runCaseId 成组取。
	(table) => [index("test_run_attachments_run_case_id_idx").on(table.runCaseId)]
);

export type TestRunAttachment = typeof testRunAttachments.$inferSelect;
export type NewTestRunAttachment = typeof testRunAttachments.$inferInsert;
