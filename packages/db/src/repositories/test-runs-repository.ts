import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	getTableColumns,
	ilike,
	type SQL,
	sql,
} from "drizzle-orm";

import { db } from "../index";
import {
	type TestRun,
	type TestRunCaseResult,
	type TestRunStatus,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import { users } from "../schema/users";
import type { DbTransaction } from "./repository-types";
import { settleAutoSubmitForProject } from "./test-run-auto-submit-repository";

/**
 * 测试任务的**聚合读查询**：列表页那一条带结论分布的查询，以及
 * 「这条用例被多少个测试任务引用」的引用计数。
 *
 * 详情装配在 `test-run-detail-repository.ts`，写路径在
 * `test-run-mutations-repository.ts` / `test-run-defects-repository.ts`。
 * 列表相关的类型留在本文件，`apps/web` 的表格组件按
 * `@automationstack/db/repositories/test-runs-repository` 引 `TestRunListItem`。
 */

/**
 * 一个测试任务的结论分布。
 *
 * 两个率的口径完全不同，所以两边的分母都得能从这里算出来（plan §2）：
 * - 完成率 = (total - untested) / total —— 四种结论都算「测过了」
 * - 通过率 = passed / (passed + failed) —— 阻塞与跳过踢出分母
 */
export interface TestRunResultCounts {
	blocked: number;
	failed: number;
	passed: number;
	skipped: number;
	total: number;
	untested: number;
}

export interface TestRunListItem {
	counts: TestRunResultCounts;
	/**
	 * `run.createdBy` 对应的用户名，**纯展示用**。
	 *
	 * 直接在这条查询里 LEFT JOIN 出来，而不是让前端拿 uuid 去换名字：
	 * `users.list` 是 `adminProcedure`，普通成员根本拉不到名单，
	 * 界面上那一列会永远显示一串 uuid 或者干脆空着。
	 *
	 * 为 null 的两种成因：测试任务没有创建人（`createdBy` 本就可空，比如脚本建的），
	 * 或账号已被删（外键 `onDelete: "set null"`）。两种都只影响署名，
	 * 不影响这一行的任何判定——要判定就读 `run.createdBy` 本身。
	 */
	createdByName: string | null;
	run: TestRun;
}

export interface ListTestRunsFilter {
	keyword?: string;
	projectId: string;
	status?: TestRunStatus;
}

/**
 * 某个结论的计数。
 *
 * 用 `count(...) filter (where ...)` 而不是「先查列表、再逐个查统计」：
 * 后者是 N+1，列表页有 50 个测试任务就是 51 次往返。聚合到一次 group by 里，
 * 列表页永远只打一个查询。
 *
 * 计数对象写 `test_run_cases.id` 而不是 `*`：左连接下没有用例行的测试任务会产生
 * 一行全 null 的连接结果，`count(*)` 会把它算成 1。
 */
function resultCount(result: TestRunCaseResult): SQL<number> {
	return sql<number>`count(${testRunCases.id}) filter (where ${testRunCases.result} = ${result}::test_run_case_result)`.mapWith(
		Number
	);
}

function buildListConditions(filter: ListTestRunsFilter): SQL[] {
	const conditions: SQL[] = [eq(testRuns.projectId, filter.projectId)];
	if (filter.status) {
		conditions.push(eq(testRuns.status, filter.status));
	}
	if (filter.keyword) {
		const escaped = filter.keyword.replace(/[%_\\]/g, "\\$&");
		conditions.push(ilike(testRuns.name, `%${escaped}%`));
	}
	return conditions;
}

/**
 * 项目下的测试任务列表，每个任务带完整的结论分布统计。
 *
 * 用 `leftJoin` 而不是 `innerJoin`：刚建好还没勾用例的空任务也必须出现在列表里，
 * 否则用户新建完看不到自己刚建的东西。
 */
export async function listTestRuns(
	projectId: string,
	filter: Omit<ListTestRunsFilter, "projectId"> = {}
): Promise<TestRunListItem[]> {
	// 读路径入口的惰性自动提交结算（plan §2.5）：没有定时任务，
	// 到期的测试任务靠「有人来看」这件事翻状态。列表页是访问频率最高的入口，
	// 放在这里能让绝大多数测试任务在用户看到之前就已经结算完毕。
	await settleAutoSubmitForProject(projectId);
	const rows = await db
		.select({
			...getTableColumns(testRuns),
			blocked: resultCount("blocked"),
			createdByName: users.username,
			failed: resultCount("failed"),
			passed: resultCount("passed"),
			skipped: resultCount("skipped"),
			total: count(testRunCases.id),
			untested: resultCount("untested"),
		})
		.from(testRuns)
		.leftJoin(testRunCases, eq(testRunCases.runId, testRuns.id))
		// 创建人的名字。**LEFT JOIN 不是风格选择**：`createdBy` 可空，
		// 内连接会让没有创建人的测试任务整行从列表里消失——用户建完看不到自己建的。
		.leftJoin(users, eq(users.id, testRuns.createdBy))
		.where(and(...buildListConditions({ ...filter, projectId })))
		// 分组里带上 `users.id`（而不是 `users.username`）：它是主键，
		// Postgres 的函数依赖推断据此放行 select 里的 username。
		.groupBy(testRuns.id, users.id)
		.orderBy(desc(testRuns.createdAt));
	return rows.map(
		({
			blocked,
			createdByName,
			failed,
			passed,
			skipped,
			total,
			untested,
			...run
		}) => ({
			counts: { blocked, failed, passed, skipped, total, untested },
			createdByName,
			run,
		})
	);
}

/**
 * 有多少个**测试任务**引用了这条用例（同一个任务里只可能有一行，故按 runId 去重
 * 与按行数计其实等价，写 distinct 是为了让语义与调用方给用户看的文案一致）。
 *
 * 供 `removeTestCaseInTx` 的删除前置检查使用（plan §3.4）。必须在删除所在的
 * 同一事务里查，否则查完到删掉之间别人可以新建测试任务引用它。
 */
export async function countCaseRunReferences(
	tx: DbTransaction,
	caseId: string
): Promise<number> {
	const [row] = await tx
		.select({ value: countDistinct(testRunCases.runId) })
		.from(testRunCases)
		.where(eq(testRunCases.caseId, caseId));
	return row?.value ?? 0;
}
