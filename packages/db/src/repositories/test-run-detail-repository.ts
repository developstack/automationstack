import { asc, eq, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../index";
import { modules } from "../schema/modules";
import {
	type CasePriority,
	type CaseStatus,
	type CaseStep,
	testCases,
} from "../schema/test-cases";
import {
	type TestRun,
	type TestRunCase,
	testRunCases,
	testRuns,
} from "../schema/test-runs";
import { users } from "../schema/users";
import { settleAutoSubmitForRun } from "./test-run-auto-submit-repository";

/**
 * 测试任务详情的装配：任务本身 + 用例清单 + 两个署名。
 *
 * 与列表查询（`test-runs-repository.ts`）分开，是因为两者要回答的问题不同：
 * 列表要的是每个任务的结论分布聚合，详情要的是逐条用例 join 出来的**活数据**
 * （D2：用例只有一份，详情页永远看最新版）。合在一起只会让两组
 * 互不相干的 join 和 map 挤在一屏里。
 */

/**
 * 详情页看到的用例内容：**实时从 `test_cases` join 出来的活数据**，不是快照。
 *
 * 用例永远只有一份，改动实时同步（D2）。所以这里的字段全部来自 `test_cases`
 * 的当前行，`test_run_cases` 只贡献一个 `caseId` 外键。
 */
export interface TestRunLiveCase {
	currentVersion: number;
	id: string;
	moduleId: string;
	moduleName: string;
	name: string;
	preconditions: string | null;
	priority: CasePriority;
	status: CaseStatus;
	steps: CaseStep[];
}

export interface TestRunCaseDetail {
	/**
	 * `runCase.executedBy` 对应的用户名，**纯展示**（页面上只有 uuid，
	 * 谁都看不出「最后是谁判的」）。
	 *
	 * ⚠️ 任何判定逻辑都不准读它，理由与 `TestRunDetail.submittedByName` 完全相同：
	 * 它为 null 有两种成因（没人执行过 / 执行人账号已被删），拿名字当判据
	 * 就是把后者当成前者。判定永远只看 `runCase.executedBy` 与 `runCase.result`。
	 * 「这条结论的完整来龙去脉」也不在这里——那要问 `test_run_case_events`。
	 */
	executedByName: string | null;
	runCase: TestRunCase;
	testCase: TestRunLiveCase;
}

export interface TestRunDetail {
	cases: TestRunCaseDetail[];
	/** `run.createdBy` 对应的用户名，纯展示用；成因与 `TestRunListItem.createdByName` 相同。 */
	createdByName: string | null;
	run: TestRun;
	/**
	 * `run.submittedBy` 对应的用户名，**纯展示用的附属信息，不是判定依据**。
	 *
	 * ⚠️ **判断「是否系统自动提交」永远只看 `run.submittedBy`**（D16：
	 * `submittedAt IS NOT NULL AND submittedBy IS NULL` 是自动提交的唯一标记，
	 * 没有布尔列）。这个名字为 null 有**两种**成因：
	 *
	 * 1. 真·自动提交——`submittedBy` 本身就是 null；
	 * 2. join 不到人——`submittedBy` 有值，但那个账号已被删
	 *    （外键 `onDelete: "set null"`，此时该列会被置空，但在被置空之前的
	 *    任何并发读、以及将来若改了删除策略，都可能出现「有 uuid 没有行」）。
	 *
	 * 拿名字去判定，就是把第 2 种当成第 1 种，界面会对一个明明有人提交的测试任务
	 * 说「由系统自动提交」。名字只配印在页面上。
	 */
	submittedByName: string | null;
}

/**
 * 测试任务详情：任务本身 + 用例清单。
 *
 * 用例内容走 `innerJoin test_cases`（内连接是安全的：`caseId` 是
 * `onDelete: restrict` 外键，被引用的用例不可能被删掉），因此详情页看到的
 * 永远是用例的最新内容。这也让「别人改了用例，测试任务页面自动刷新」这件事
 * 零成本成立——第一期已有的 `case` 失效事件就够了（plan §4.2）。
 */
export async function getTestRunDetail(
	runId: string
): Promise<TestRunDetail | null> {
	await settleAutoSubmitForRun(runId);
	// 同一张 users 表要 join 两次（创建人 / 提交人），必须各起一个别名，
	// 否则两个 join 指向同一个 FROM 项，第二个条件会把第一个覆盖掉。
	const creator = alias(users, "creator");
	const submitter = alias(users, "submitter");
	const [row] = await db
		.select({
			createdByName: creator.username,
			run: testRuns,
			submittedByName: submitter.username,
		})
		.from(testRuns)
		// 两处都是 LEFT JOIN：`createdBy` / `submittedBy` 都可空
		// （后者为空正是「系统自动提交」），INNER 会让整个测试任务查不到。
		.leftJoin(creator, eq(creator.id, testRuns.createdBy))
		.leftJoin(submitter, eq(submitter.id, testRuns.submittedBy))
		.where(eq(testRuns.id, runId))
		.limit(1);
	if (!row) {
		return null;
	}
	// 第三个 users 别名：用例行上的执行人。与上面两个同理，同表多次 join 必须各起别名。
	const executor = alias(users, "executor");
	const rows = await db
		.select({
			...getTableColumns(testRunCases),
			caseCurrentVersion: testCases.currentVersion,
			caseModuleId: testCases.moduleId,
			caseModuleName: modules.name,
			caseName: testCases.name,
			casePreconditions: testCases.preconditions,
			casePriority: testCases.priority,
			caseStatus: testCases.status,
			caseSteps: testCases.steps,
			executedByName: executor.username,
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.innerJoin(modules, eq(modules.id, testCases.moduleId))
		// LEFT JOIN：未打结论的行 `executedBy` 为 null，INNER 会把它们整行滤掉。
		.leftJoin(executor, eq(executor.id, testRunCases.executedBy))
		.where(eq(testRunCases.runId, runId))
		.orderBy(asc(testRunCases.sortOrder), asc(testRunCases.createdAt));
	const cases = rows.map(
		({
			caseCurrentVersion,
			caseModuleId,
			caseModuleName,
			caseName,
			casePreconditions,
			casePriority,
			caseStatus,
			caseSteps,
			executedByName,
			...runCase
		}) => ({
			executedByName,
			runCase,
			testCase: {
				currentVersion: caseCurrentVersion,
				id: runCase.caseId,
				moduleId: caseModuleId,
				moduleName: caseModuleName,
				name: caseName,
				preconditions: casePreconditions,
				priority: casePriority,
				status: caseStatus,
				steps: caseSteps,
			},
		})
	);
	// `run` 原样返回：`createdBy` / `submittedBy` 两个 uuid 一个都不撤。
	// 加名字是为了少一次查询，不是为了替换 id——判定、跳转、权限都还得靠 id。
	return {
		cases,
		createdByName: row.createdByName,
		run: row.run,
		submittedByName: row.submittedByName,
	};
}
