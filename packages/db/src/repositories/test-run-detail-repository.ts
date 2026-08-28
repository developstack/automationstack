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
	maintainer: string | null;
	moduleId: string;
	moduleName: string;
	name: string;
	preconditions: string | null;
	priority: CasePriority;
	status: CaseStatus;
	steps: CaseStep[];
	/** 用例内容本身的更新时间，不是这条执行记录的更新时间。 */
	updatedAt: Date;
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
 * 任务头：任务本身 + 创建人 / 提交人两个署名，一条 SQL 一次取齐。
 *
 * 两个署名**不另外发查询**：它们与任务行是一对一的，各查一次只是把
 * 一次往返变成三次，换不来任何东西。
 */
async function loadRunHeader(runId: string) {
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
	return row ?? null;
}

/**
 * 用例清单：`test_run_cases` 的全部列 + 实时 join 出来的用例内容 + 执行人名字。
 *
 * ⚠️ **整份清单只发这一条 SQL，不许改成「先查行、再逐行补内容」**。
 * 一个回归任务动辄几百条用例，逐行补就是几百次往返；而这里要的东西
 * （用例内容、模块名、执行人名）全都是一对一的，join 进来零代价。
 * 排序也必须留在 SQL 里：`sortOrder` 有并列，靠 `createdAt` 破平，
 * 挪到内存里排会让「两次打开顺序不一样」这种事偶发出现。
 */
async function loadRunCaseRows(runId: string) {
	// 第三个 users 别名：用例行上的执行人。与上面两个同理，同表多次 join 必须各起别名。
	const executor = alias(users, "executor");
	return await db
		.select({
			...getTableColumns(testRunCases),
			caseCurrentVersion: testCases.currentVersion,
			caseMaintainer: testCases.maintainer,
			caseModuleId: testCases.moduleId,
			caseModuleName: modules.name,
			caseName: testCases.name,
			casePreconditions: testCases.preconditions,
			casePriority: testCases.priority,
			caseStatus: testCases.status,
			caseSteps: testCases.steps,
			caseUpdatedAt: testCases.updatedAt,
			executedByName: executor.username,
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.innerJoin(modules, eq(modules.id, testCases.moduleId))
		// LEFT JOIN：未打结论的行 `executedBy` 为 null，INNER 会把它们整行滤掉。
		.leftJoin(executor, eq(executor.id, testRunCases.executedBy))
		.where(eq(testRunCases.runId, runId))
		.orderBy(asc(testRunCases.sortOrder), asc(testRunCases.createdAt));
}

/**
 * 行类型从查询本身推导，不手写第二份。
 *
 * 上面那个 select 的列清单一改，这里跟着变，`toRunCaseDetail` 的解构立刻
 * 编译不过——手抄一份 interface 则只会在运行时静默少一个字段。
 */
type TestRunCaseRow = Awaited<ReturnType<typeof loadRunCaseRows>>[number];

/**
 * 一行扁平结果 → 「执行记录 / 用例内容」两段。
 *
 * 用 rest 解构把 `case*` 前缀的列摘出去，剩下的就恰好是 `test_run_cases`
 * 的全部列——于是将来给那张表加一列，这里一个字都不用改。
 */
function toRunCaseDetail({
	caseCurrentVersion,
	caseMaintainer,
	caseModuleId,
	caseModuleName,
	caseName,
	casePreconditions,
	casePriority,
	caseStatus,
	caseSteps,
	caseUpdatedAt,
	executedByName,
	...runCase
}: TestRunCaseRow): TestRunCaseDetail {
	return {
		executedByName,
		runCase,
		testCase: {
			currentVersion: caseCurrentVersion,
			id: runCase.caseId,
			maintainer: caseMaintainer,
			moduleId: caseModuleId,
			moduleName: caseModuleName,
			name: caseName,
			preconditions: casePreconditions,
			priority: casePriority,
			status: caseStatus,
			steps: caseSteps,
			updatedAt: caseUpdatedAt,
		},
	};
}

/**
 * 测试任务详情：任务本身 + 用例清单。
 *
 * 用例内容走 `innerJoin test_cases`（内连接是安全的：`caseId` 是
 * `onDelete: restrict` 外键，被引用的用例不可能被删掉），因此详情页看到的
 * 永远是用例的最新内容。这也让「别人改了用例，测试任务页面自动刷新」这件事
 * 零成本成立——第一期已有的 `case` 失效事件就够了（plan §4.2）。
 *
 * 任务头查不到就**立刻返回，不再发第二条 SQL**：清单查询对一个不存在的
 * runId 只会拿到空数组，白跑一次往返。
 */
export async function getTestRunDetail(
	runId: string
): Promise<TestRunDetail | null> {
	await settleAutoSubmitForRun(runId);
	const header = await loadRunHeader(runId);
	if (header === null) {
		return null;
	}
	const rows = await loadRunCaseRows(runId);
	// `run` 原样返回：`createdBy` / `submittedBy` 两个 uuid 一个都不撤。
	// 加名字是为了少一次查询，不是为了替换 id——判定、跳转、权限都还得靠 id。
	return {
		cases: rows.map(toRunCaseDetail),
		createdByName: header.createdByName,
		run: header.run,
		submittedByName: header.submittedByName,
	};
}
