import { count, desc, eq, sql } from "drizzle-orm";

import { db } from "../index";
import { automationExecutions } from "../schema/automation-executions";
import { testCases } from "../schema/test-cases";
import { testRunCases } from "../schema/test-runs";
import { users } from "../schema/users";

/**
 * 报告页的「自动化执行记录」块（plan §6.3）。
 *
 * 它存在的**唯一**理由是 §2.2 那个风险：读报告的人要能看出「这批结论是哪一轮
 * 脚本刷进来的、有没有哪几条被跳过了」。不给它加别的职责——它是解释性材料，
 * 不参与任何统计口径，报告顶部那几个数字一个字都不受它影响（§6.1 / §6.4）。
 *
 * ## ⚠️ 两个计数都必须现算，不许读 `automation_executions` 上那两列
 *
 * `updatedCount` / `skippedCount` 那两列是**跨任务全局**的冗余计数：一次执行
 * 可能同时写进多个测试任务（§3.7 D33），那两列对其中任何单个任务都虚高。
 * 直接显示的后果是「刷新 80 条」出现在一个总共才 40 条用例的报告里——
 * 不报错，只是静默地数错。所以本文件的两个数字分别这么来：
 *
 * - 刷新条数：`test_run_cases where run_id = ? and last_automation_execution_id
 *   is not null` 按 executionId 聚合，再连回 `automation_executions` 取分支与 commit；
 * - 跳过条数：那一轮的对账单（`receipt`）里属于**本任务**的 `skippedManual` 条目。
 *
 * 两者都在**同一条查询**里出，不许 N+1（与失败清单同一条原则）。
 */

/**
 * 跳过条数：从 `receipt.skippedManual` 里数属于本任务的条目。
 *
 * ## 为什么只能从对账单里数
 *
 * 被跳过的行**压根没被写**——`result` 还是那条人工结论，`executedVia` 与
 * `lastAutomationExecutionId` 都不指向这一轮，`test_run_case_events` 里也不会有流水。
 * 库里唯一留下「这一轮跳过了它」这句话的地方，就是当时那份对账单
 * （`receipt` 列的注释把「为什么是历史陈述而不是会漂的副本」写清楚了）。
 *
 * ## 为什么是「任务名相符」**且**「这条用例确实在本任务里」
 *
 * 对账单的 `skippedManual` 条目只带 `runName`（契约见 api 侧的
 * `ingestExecutionReceiptSchema`），不带 runId——它是给人读的那份东西。
 * 光比名字不够：`test_runs` 的名字在项目内**不唯一**。所以再要求这条 sourceRef
 * 对应的用例确实在本任务里；`test_cases.source_ref` 在项目内唯一，
 * 而执行本来就是项目级的，两条合起来把跨任务串味压到只剩「同项目内两个同名任务
 * 又恰好都收着这条用例」这一种，届时多数一条也只是解释性材料多说了一句。
 *
 * `receipt` 可空（0009 之前的历史行没有这一列），coalesce 成空数组即得 0——
 * 这正是「读取方必须对 null 有确定降级行为」的落点。
 */
function skippedForRun(runId: string, runName: string) {
	return sql<number>`(
		select count(*)
		from jsonb_array_elements(
			coalesce(${automationExecutions.receipt} -> 'skippedManual', '[]'::jsonb)
		) as skipped_entry
		where skipped_entry ->> 'runName' = ${runName}
			and exists (
				select 1
				from ${testRunCases} as skipped_run_case
				join ${testCases} as skipped_case
					on skipped_case.id = skipped_run_case.case_id
				where skipped_run_case.run_id = ${runId}
					and skipped_case.source_ref = skipped_entry ->> 'sourceRef'
			)
	)`.mapWith(Number);
}

export interface TestRunAutomationExecution {
	branch: string | null;
	/** 有它才出「去看这次跑的日志」那条链接；本机跑就是 null。 */
	ciUrl: string | null;
	commitSha: string | null;
	/**
	 * 服务端把这一轮全部写完的时刻。**null = 这一轮没跑完**（进程被杀、事务回滚，
	 * §5.5），报告里必须标成「未完成」，不能当成完整的一轮展示——
	 * 它下面那两个条数只是「跑到一半时写进去的部分」。
	 */
	completedAt: Date | null;
	executionId: string;
	/** 脚本自己报的结束时间，客户端时钟，只做展示。 */
	finishedAt: Date | null;
	/** 服务端收到这一轮的时刻（`automation_executions.createdAt`），排序也按它。 */
	reportedAt: Date;
	/** 上报所用 token 的主人；账号被删时为 null（外键 set null），记录本身仍有效。 */
	reportedByName: string | null;
	/** 本任务里被这一轮跳过的条数。⚠️ 不是 `automation_executions.skippedCount`。 */
	skippedCount: number;
	/** 本任务里被这一轮刷新的条数。⚠️ 不是 `automation_executions.updatedCount`。 */
	updatedCount: number;
}

/**
 * 本任务被哪几轮执行刷过，各刷了多少条、跳过多少条。最近的排前面。
 *
 * 起点是 `test_run_cases`（而不是 `automation_executions`）：这一块要回答的是
 * 「这次执行**现在**还占着本任务的哪些行」，指针就是真相所在。副作用是一轮
 * **整轮都被跳过**的执行不会出现在这里——它一行都没占住，也就没有「刷新 N 条」
 * 可言；那种情形该看的是上报方拿到的那份对账单，不是本任务的报告。
 */
export function loadAutomationExecutions(
	runId: string,
	runName: string
): Promise<TestRunAutomationExecution[]> {
	return (
		db
			.select({
				branch: automationExecutions.branch,
				ciUrl: automationExecutions.ciUrl,
				commitSha: automationExecutions.commitSha,
				completedAt: automationExecutions.completedAt,
				executionId: automationExecutions.id,
				finishedAt: automationExecutions.finishedAt,
				reportedAt: automationExecutions.createdAt,
				reportedByName: users.username,
				skippedCount: skippedForRun(runId, runName),
				updatedCount: count(testRunCases.id),
			})
			.from(testRunCases)
			.innerJoin(
				automationExecutions,
				eq(automationExecutions.id, testRunCases.lastAutomationExecutionId)
			)
			.leftJoin(users, eq(users.id, automationExecutions.reportedBy))
			.where(eq(testRunCases.runId, runId))
			// 只按两张表的主键分组：被 select 的其余列（含 receipt，跳过条数那个
			// 子查询要用它）全靠函数依赖推断放行，与失败清单同一套写法。
			.groupBy(automationExecutions.id, users.id)
			.orderBy(desc(automationExecutions.createdAt))
	);
}
