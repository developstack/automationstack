import { and, asc, count, eq } from "drizzle-orm";

import { db } from "../index";
import { automationExecutions } from "../schema/automation-executions";
import { modules } from "../schema/modules";
import { type CasePriority, testCases } from "../schema/test-cases";
import { testRunAttachments } from "../schema/test-run-attachments";
import { type TestRunExecutedVia, testRunCases } from "../schema/test-runs";
import { users } from "../schema/users";

/**
 * 报告页的失败清单（plan §7.4 的第 4 块，本期按 §6.2 补上「怎么复现」）。
 *
 * 从 `test-run-report-repository.ts` 拆出来纯粹是为了让两边都留在 300 行以内，
 * 口径一个字没改；那个文件顶上「不许 N+1，它们都只是同一批行的不同切法」的原则
 * 对本文件同样成立，本期新增的 `executedVia` 与 `automationExecution`
 * 因此也走**同一条查询**，而不是拿到清单以后再逐行回表。
 */

/** 脚本报的那条失败要能复现，靠的就是这四项（§6.2）。 */
export interface TestRunFailedCaseAutomation {
	branch: string | null;
	/** CI 里跑才有；本机跑就是 null，报告上那条「去看这次跑的日志」据此决定要不要出链接。 */
	ciUrl: string | null;
	commitSha: string | null;
	executionId: string;
	/**
	 * 脚本自己报的结束时间（客户端时钟，只做展示）。
	 * 与 `executedAt`（这条结论落库的时刻）不是一回事，两者都留着：
	 * 前者回答「这批结果是什么时候跑出来的」，后者回答「平台什么时候收到的」。
	 */
	finishedAt: Date | null;
}

/** 报告页真正要交出去的东西：失败清单（plan §7.4）。 */
export interface TestRunFailedCase {
	/**
	 * 这条失败用例挂了几个附件。
	 *
	 * **只给计数，不给 URL**：签名 URL 是 15 分钟有效期的，而报告页可能被开着
	 * 一下午；一张 40 行的失败清单预签一遍就是 40 次签名，绝大多数还没人点。
	 * 有了计数，列表上「哪几行有截图」一眼可见，缩略图仍由前端按需
	 * 调 `testRunAttachments.list` 拉——那是点开时才发生的一次。
	 */
	attachmentCount: number;
	/**
	 * 打这条结论的那次自动化执行（§6.2）。人测出来的失败这里是 null——
	 * 判「是不是脚本报的」看 `executedVia`，不要看这一项是不是 null：
	 * 执行记录被运维清理掉时外键是 `set null`（见 schema 注释），
	 * 那时结论仍然是脚本打的，只是没有 CI 链接可点了。
	 */
	automationExecution: TestRunFailedCaseAutomation | null;
	caseId: string;
	/** 失败原因。 */
	comment: string | null;
	defectKey: string | null;
	defectStatus: string | null;
	defectTitle: string | null;
	defectUrl: string | null;
	executedAt: Date | null;
	/**
	 * 执行人。个人 token 让脚本上报也有真人署名，所以这一列对两种来源都成立，
	 * 本期一个字没改（§6.2）。
	 */
	executedByName: string | null;
	/**
	 * 人测的还是脚本报的（§6.2 的行上标记）。
	 * **null 有含义**：这行结论是第二期写下的（那时还没有这一列），
	 * 不等于「手工」——所以前端只在 `automation` 时出脚本标记，不给 null 编故事。
	 */
	executedVia: TestRunExecutedVia | null;
	moduleName: string;
	name: string;
	priority: CasePriority;
	runCaseId: string;
}

/**
 * 失败清单的那一条查询。附件数走**同一条查询**里的 `count(...) + group by`，
 * 不是每条失败用例再查一次——失败用例可能有几十条，那就是几十次往返，
 * 而它们只是同一批行的另一种切法（与报告页其余聚合同一条原则）。
 *
 * `count(test_run_attachments.id)` 而不是 `count(*)`：左连接下没有附件的用例
 * 会产生一行全 null 的连接结果，`count(*)` 会把它算成 1，于是每条失败用例
 * 看起来都「有 1 个附件」。
 *
 * 执行记录这条左连接**不会**让附件数翻倍：它是 `lastAutomationExecutionId`
 * 指向主键的多对一，一行用例最多连出一行执行记录。附件那条是一对多，
 * 所以只有它需要 `count`。
 */
function selectFailedCaseRows(runId: string) {
	return (
		db
			.select({
				attachmentCount: count(testRunAttachments.id),
				automationBranch: automationExecutions.branch,
				automationCiUrl: automationExecutions.ciUrl,
				automationCommitSha: automationExecutions.commitSha,
				automationExecutionId: automationExecutions.id,
				automationFinishedAt: automationExecutions.finishedAt,
				caseId: testCases.id,
				comment: testRunCases.comment,
				defectKey: testRunCases.defectKey,
				defectStatus: testRunCases.defectStatus,
				defectTitle: testRunCases.defectTitle,
				defectUrl: testRunCases.defectUrl,
				executedAt: testRunCases.executedAt,
				executedByName: users.username,
				executedVia: testRunCases.executedVia,
				moduleName: modules.name,
				name: testCases.name,
				priority: testCases.priority,
				runCaseId: testRunCases.id,
			})
			.from(testRunCases)
			.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
			.innerJoin(modules, eq(modules.id, testCases.moduleId))
			.leftJoin(users, eq(users.id, testRunCases.executedBy))
			.leftJoin(
				automationExecutions,
				eq(automationExecutions.id, testRunCases.lastAutomationExecutionId)
			)
			.leftJoin(
				testRunAttachments,
				eq(testRunAttachments.runCaseId, testRunCases.id)
			)
			.where(
				and(eq(testRunCases.runId, runId), eq(testRunCases.result, "failed"))
			)
			// 分组只列五张表的主键，其余被 select 的列全靠 Postgres 的函数依赖推断
			// 放行。列成 `modules.name` / `users.username` 那样的具体列也能跑，
			// 但每加一个展示字段就得回来补一个 group by 项，迟早漏。
			.groupBy(
				testRunCases.id,
				testCases.id,
				modules.id,
				users.id,
				automationExecutions.id
			)
			.orderBy(asc(testCases.priority), asc(testRunCases.sortOrder))
	);
}

type FailedCaseRow = Awaited<ReturnType<typeof selectFailedCaseRows>>[number];

/**
 * 把左连接摊平的那几列折回一个可空对象。
 *
 * 折叠这一步只能在 TS 里做：左连接没连上时，那几列各自是 null，而调用方要问的是
 * 「这条失败有没有执行记录」这**一个**问题——留着四个各自可空的列，
 * 前端就得自己判断「branch 是 null 但 commitSha 不是」这种压根不存在的组合。
 */
function toFailedCase(row: FailedCaseRow): TestRunFailedCase {
	const {
		automationBranch,
		automationCiUrl,
		automationCommitSha,
		automationExecutionId,
		automationFinishedAt,
		...rest
	} = row;
	return {
		...rest,
		automationExecution:
			automationExecutionId === null
				? null
				: {
						branch: automationBranch,
						ciUrl: automationCiUrl,
						commitSha: automationCommitSha,
						executionId: automationExecutionId,
						finishedAt: automationFinishedAt,
					},
	};
}

export async function loadFailedCases(
	runId: string
): Promise<TestRunFailedCase[]> {
	const rows = await selectFailedCaseRows(runId);
	return rows.map(toFailedCase);
}
