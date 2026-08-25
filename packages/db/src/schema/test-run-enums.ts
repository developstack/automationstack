import { pgEnum } from "drizzle-orm/pg-core";

/**
 * 测试任务链路的**跨包共享词汇表**：四个 pgEnum 及其字面量联合类型。
 *
 * 从 `schema/test-runs.ts` 拆出来是为了让那个文件回到 300 行以内，
 * 分组语义一个字没改：这四个枚举仍然是同一组共享词汇表，且**仍然从
 * `@automationstack/db/schema/test-runs` 导出**（那边 re-export 回去），
 * `apps/web` 与 `packages/api` 里现有的十几处 import 路径因此一处都不用动。
 *
 * 依赖方向是单向的——表定义引用枚举，枚举不引用任何表，不构成模块循环。
 * 两个文件都由 `schema/index.ts` 用 `export *` 汇总进 drizzle 的命名空间对象。
 */

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
 * 这条往返正是 `test_run_events` 存在的理由（见 `schema/test-run-events.ts`）。
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

/**
 * 结论 / 附件的来源（plan §3.3、§3.4）。
 *
 * 与上面三个 pgEnum 一起留在本文件，理由相同：这里是跨包共享的词汇表，
 * `apps/web` 与 `packages/api` 都从 `@automationstack/db/schema/test-runs` 取类型。
 *
 * 它被两处复用——`test_run_cases.executedVia`（结论是谁打的）与
 * `test_run_attachments.uploadedVia`（附件是谁传的）。刻意不为附件另造一个
 * 同值枚举：两处问的是同一个问题「人还是脚本」，两份枚举只会在将来加第三个
 * 取值时分叉。
 */
export const testRunExecutedViaEnum = pgEnum("test_run_executed_via", [
	"manual",
	"automation",
]);

export type TestRunStatus = (typeof testRunStatusEnum.enumValues)[number];
export type TestRunCaseResult =
	(typeof testRunCaseResultEnum.enumValues)[number];
export type TestRunAttachmentKind =
	(typeof testRunAttachmentKindEnum.enumValues)[number];
export type TestRunExecutedVia =
	(typeof testRunExecutedViaEnum.enumValues)[number];
