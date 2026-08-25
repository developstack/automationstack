import { and, asc, eq, notExists, type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import { automationExecutions } from "../schema/automation-executions";
import { modules } from "../schema/modules";
import { type CasePriority, testCases } from "../schema/test-cases";
import { testRunCases } from "../schema/test-runs";

/**
 * 报告页的「越界用例」清单：这一轮脚本报了结论、但当时**不在任何未提交任务里**
 * 的那些用例（对账单的 `outOfScope`，§5.1.1）。
 *
 * ## 它为什么只是一份清单
 *
 * §9 明写「越界用例**不会被自动追加**进测试任务」。平台把事实摆出来——
 * 「你的脚本报了这 3 条，谁都没收」——追加与否是人的判断：那可能是本迭代
 * 故意不测的模块，也可能是漏挑了用例。所以本文件只负责查出来，
 * 追加走的是既有的 `addCases`，由人在报告页点一下（前端亦然，没有任何自动路径）。
 *
 * ## 取数与去重
 *
 * 只认 `runName` 为 null 的条目：那是「没有任何未提交任务收它」。带任务名的
 * 条目是「某个具体任务拒了它」（待评审、写入前一瞬被提交），那是那个任务的事，
 * 追加进本任务解决不了它，混进来只会让人点了个没用的按钮。
 *
 * 已经在本任务里的用例要排掉：读报告的人是在几天后打开这一页的，
 * 那几条很可能早被人手动追加进来了，再挂着一个「追加到本任务」的按钮
 * 只会让人以为自己上次没点成。
 */

/** 展示与追加各需要一半：名字模块优先级给人看，caseId 给「追加」按钮用。 */
export interface TestRunOutOfScopeCase {
	caseId: string;
	moduleName: string;
	name: string;
	priority: CasePriority;
	/** 脚本用的那个标识，对不上时人得回代码里查的就是它。 */
	sourceRef: string | null;
}

/**
 * 从本任务相关的那几轮执行的对账单里，取出「谁都没收」的 caseId。
 *
 * 执行的范围与执行记录块完全一致（按 `lastAutomationExecutionId` 反查），
 * 于是这份清单永远是「上面那几轮执行顺带报出来的越界用例」，
 * 不会把项目里另一条与本任务毫无关系的执行也拉进来。
 */
function outOfScopeCaseIds(runId: string): SQL {
	return sql`select (scope_entry ->> 'caseId')::uuid
		from ${automationExecutions}
		cross join lateral jsonb_array_elements(
			coalesce(${automationExecutions.receipt} -> 'outOfScope', '[]'::jsonb)
		) as scope_entry
		where ${automationExecutions.id} in (
			select scope_run_case.last_automation_execution_id
			from ${testRunCases} as scope_run_case
			where scope_run_case.run_id = ${runId}
				and scope_run_case.last_automation_execution_id is not null
		)
			and scope_entry ->> 'runName' is null
			and scope_entry ->> 'caseId' is not null`;
}

/**
 * 一条 SQL 出完：`in (子查询)` 天然去重，不需要先把 caseId 拉回来再回表查名字
 * （那正是「同一批行的不同切法」被拆成两次往返的典型写法）。
 */
export function loadOutOfScopeCases(
	runId: string
): Promise<TestRunOutOfScopeCase[]> {
	return db
		.select({
			caseId: testCases.id,
			moduleName: modules.name,
			name: testCases.name,
			priority: testCases.priority,
			sourceRef: testCases.sourceRef,
		})
		.from(testCases)
		.innerJoin(modules, eq(modules.id, testCases.moduleId))
		.where(
			and(
				sql`${testCases.id} in (${outOfScopeCaseIds(runId)})`,
				notExists(
					db
						.select({ one: sql`1` })
						.from(testRunCases)
						.where(
							and(
								eq(testRunCases.runId, runId),
								eq(testRunCases.caseId, testCases.id)
							)
						)
				)
			)
		)
		.orderBy(asc(testCases.priority), asc(modules.name), asc(testCases.name));
}
