import { type SQL, sql } from "drizzle-orm";

import { testCases } from "../schema/test-cases";
import {
	type TestRunCaseResult,
	type TestRunExecutedVia,
	testRunCases,
} from "../schema/test-runs";
import {
	EMPTY_STEP_RESULTS_SQL,
	uniformStepResultsSql,
} from "./test-run-step-results-sql";

/**
 * 手工打结论时写进 `test_run_cases` 的那一组字段。
 *
 * 单独成文件的核心是 `buildResultPatch`——回退成 `untested` 要连带清掉哪些字段、
 * 非 untested 时 `comment` 为什么只在显式给值时才写，这些判断只在打结论这条
 * 路径上成立，混进范围管理里会被当成通用逻辑复用出错。
 *
 * 手工单条与手工批量（都在 `test-run-verdicts-repository.ts`）共用它，
 * 两条路径因此不可能对「回退要清哪几列」产生分歧。自动化上报走的是另一条
 * 整批 UPDATE（`test-run-automation-verdicts.ts`）——那里每行的 result 与
 * comment 各不相同，拼不成同一个 patch 对象——但它写的列与这里逐列对齐，
 * 动这个文件就必须同步看那一条 SQL。
 */

export interface ResultPatchInput {
	actorId: string | null;
	comment?: string | null;
	result: TestRunCaseResult;
	/**
	 * 这条结论是人打的还是脚本打的。**必填、不给默认值**（plan §5.4）：
	 * 给了默认值，将来第三种来源接进来时会静默混进手工统计，而且不会有任何地方报错。
	 */
	via: TestRunExecutedVia;
}

/** `caseVersion` 走相关子查询，因此这里要能放 SQL 片段而不只是数字。 */
export interface RunCaseResultPatch {
	caseVersion?: SQL | null;
	comment?: string | null;
	executedAt?: Date | null;
	executedBy?: string | null;
	executedVia?: TestRunExecutedVia | null;
	lastAutomationExecutionId?: string | null;
	result: TestRunCaseResult;
	/** 分步结果。走 SQL 是因为步骤要就地从 `test_cases.steps` 里取，见下。 */
	stepResults?: SQL;
}

/**
 * 结论字段的写入内容。
 *
 * 回退成 `untested` 时把 `executedAt` / `executedBy` / `executedVia` /
 * `lastAutomationExecutionId` / `caseVersion` 一并抹掉：
 * 这三个字段的含义都是「这条结论是谁、什么时候、对着哪一版用例打的」，
 * 结论都撤了还留着执行痕迹，用例详情页的跨测试任务执行历史里就会出现
 * 一条「测过但没有结论」的幽灵记录。
 *
 * `comment` 也跟着一起清：一条标着「未测」却挂着「支付超时，订单状态没回滚」
 * 的行，在报告和执行台上都会被当成活的结论读，比丢掉一段文字危险得多。
 * 「环境挂了，想留着说明待会儿重测」有专门的出口——`blocked`（plan §2.4 的逃生口）；
 * 回退到未测的语义是「我刚才标错了」，标错的结论不该留下它的理由。
 *
 * 非 untested 时，`comment` 只在调用方显式给了值时才写（含显式写 null 表示清空）：
 * 「一键全部通过」不带 comment，不该把别人写的失败原因静默抹掉。
 *
 * `via === "manual"` 且不是 untested 时，`lastAutomationExecutionId` 也要清成 null。
 * 那一列的含义是「**最后一次写这条结论的自动化执行**」；人刚手工改了这条结论，
 * 就不再有任何自动化执行是它的来源了。留着那个 id，报告里的执行记录块（plan §6.3）
 * 会把这条已经被人改过的行仍然算进那次执行的条数里，数字静默虚高。
 * 由此确立的不变式是：`lastAutomationExecutionId !== null` ⟹ `executedVia === "automation"`。
 */
export function buildResultPatch(input: ResultPatchInput): RunCaseResultPatch {
	const patch: RunCaseResultPatch = { result: input.result };
	if (input.comment !== undefined) {
		patch.comment = input.comment;
	}
	if (input.result === "untested") {
		patch.caseVersion = null;
		patch.comment = null;
		patch.executedAt = null;
		patch.executedBy = null;
		patch.executedVia = null;
		patch.lastAutomationExecutionId = null;
		patch.stepResults = EMPTY_STEP_RESULTS_SQL;
		return patch;
	}
	// 用例级结论是**覆盖式**的：铺满每一步，而不是留着旧的分步结果不动。
	// `result` 必须恒等于 `deriveCaseResult(stepResults)`（见 schema 里那一列的
	// 注释），留着旧分步就会立刻造出「用例判通过、第 3 步标着失败」的行——
	// 那正是分步这件事要消灭的状态。代价是「一键全部通过」会盖掉逐步判过的结果，
	// 这是一次显式的破坏性操作，被盖掉的原因在 `test_run_case_events` 里仍有快照。
	patch.stepResults = uniformStepResultsSql({
		result: sql`${input.result}::text`,
	});
	patch.executedAt = new Date();
	patch.executedBy = input.actorId;
	patch.executedVia = input.via;
	if (input.via === "manual") {
		patch.lastAutomationExecutionId = null;
	}
	// 打结论那一刻的用例版本号（plan §3.3）。用相关子查询就地取，
	// 而不是先 select 再回填：中间隔一次往返，别人正好保存了新版本，
	// 记下的就会是一个这条结论从没见过的版本号。
	patch.caseVersion = sql`(select ${testCases.currentVersion} from ${testCases} where ${testCases.id} = ${testRunCases.caseId})`;
	return patch;
}
