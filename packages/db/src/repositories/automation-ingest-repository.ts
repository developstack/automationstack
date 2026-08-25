import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "../index";
import {
	type TestRunStatus,
	testRunCases,
	testRuns,
} from "../schema/test-runs";

/**
 * 自动化上报的**取数层**（plan §5.1.1 / §5.2 / §5.3）：归属解析 + 执行记录。
 *
 * 本层刻意只做两件事——把候选摆出来、把「这一轮跑过了」这个事实钉在库里。
 * 它**不写 `test_run_cases.result`**：那条路径只有 `bulkSetRunCaseResult` 一个入口
 * （D22 / §5.4），状态推导、审计流水、`caseVersion` 快照全挂在它身上，
 * 这里再开一条捷径就等于把那三件事悄悄绕过去。
 * 它也**不做自动提交结算**（D36 / §3.8）：那一步由上层编排在解析候选之前调
 * `settleAutoSubmitForProject`，放进本层会让「解析」这个只读动作偷偷改状态。
 *
 * 取数层按内聚度分在三个文件里，这一个是外部唯一的入口路径（另外两个的东西
 * 在文件末尾原样再导出一次，调用方不必知道它们搬去了哪）：
 * - `automation-target-repository.ts`——归属解析与它的诊断查询（§5.3）；
 * - `automation-execution-repository.ts`——执行记录的幂等占位、收尾与反查（§5.2 / §5.5）；
 * - 本文件——`GET /ingest/runs` 的候选清单（§5.1.1）。
 */

export interface IngestRunSummary {
	caseCount: number;
	/** 距最近一条结论多少天；一条结论都没有则距创建时间。 */
	daysSinceLastVerdict: number;
	name: string;
	runId: string;
	status: TestRunStatus;
}

/**
 * `GET /ingest/runs` 的取数（§5.1.1）：该项目当前所有未提交任务。
 *
 * SDK 不依赖这个端点就能上报——它只是把候选摆出来给人看，顺带给 `runIds`
 * 白名单提供取值。**只披露，不裁决。**
 *
 * `daysSinceLastVerdict` 的用途是让人自己发现「v2.2 十二天没动静了，是不是忘了关」。
 * 平台不因为这个数字做任何事：那个任务照样是候选、照样会被写入，因为它确实还没提交
 * （同 §6.4「不做自动化结果过期判定」）。把「久未动」变成自动排除，就是平台在替用户
 * 裁决一个只有用户知道答案的问题——上个迭代的任务还开着，可能是忘了关，
 * 也可能是真的还在补测。
 *
 * 一条 SQL：`test_run_cases` 走 LEFT JOIN 聚合，没有用例的任务 `caseCount` 得 0
 * 而不是消失。按 run 再查一次是 N+1。
 */
export function listIngestRunSummaries(
	projectId: string
): Promise<IngestRunSummary[]> {
	return db
		.select({
			caseCount: count(testRunCases.id),
			daysSinceLastVerdict:
				sql<number>`floor(extract(epoch from now() - coalesce(max(${testRunCases.executedAt}), ${testRuns.createdAt})) / 86400)::int`.mapWith(
					Number
				),
			name: testRuns.name,
			runId: testRuns.id,
			status: testRuns.status,
		})
		.from(testRuns)
		.leftJoin(testRunCases, eq(testRunCases.runId, testRuns.id))
		.where(and(eq(testRuns.projectId, projectId), isNull(testRuns.submittedAt)))
		.groupBy(testRuns.id)
		.orderBy(desc(testRuns.createdAt));
}

/*
 * 下面两组再导出让这条路径的对外导出面与拆分前**逐个符号一致**：
 * `packages/api/src/lib/ingest/**` 四个文件与两个 .test.ts 都从这里 import，
 * 拆分不该逼着它们跟着改 import 路径（也不该让两条路径同时可用，那会分叉）。
 *
 * 只能写成 `export ... from`：换成「先 import 再 export」会撞上 biome 的
 * `style/noExportedImports`（error）。这个写法会让 `performance/noBarrelFile`
 * 报一条 warn——它误判了，本文件自己带着 `listIngestRunSummaries`，
 * 不是 barrel；两条规则里只有前者是 error，所以按前者写。
 */
export type {
	AutomationExecutionRunSummary,
	CompleteAutomationExecutionInput,
	CreateAutomationExecutionInput,
	EnsureAutomationExecutionResult,
} from "./automation-execution-repository";
export {
	completeAutomationExecution,
	ensureAutomationExecution,
	summarizeAutomationExecutionRuns,
} from "./automation-execution-repository";
export type {
	AutomationTargetRow,
	FindSubmittedRunBlockersInput,
	ResolveAutomationTargetsInput,
	SubmittedRunBlocker,
} from "./automation-target-repository";
export {
	findSubmittedRunBlockers,
	resolveAutomationTargets,
} from "./automation-target-repository";
