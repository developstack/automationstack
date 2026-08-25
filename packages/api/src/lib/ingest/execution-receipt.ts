import {
	findSubmittedRunBlockers,
	summarizeAutomationExecutionRuns,
} from "@automationstack/db/repositories/automation-ingest-repository";
import type { AutomationExecution } from "@automationstack/db/schema/automation-executions";

import {
	type IngestExecutionReceipt,
	ingestExecutionReceiptSchema,
} from "./execution-contract";
import {
	buildUnexplainedOutOfScopeEntries,
	type ReconciledAutomationTargets,
} from "./execution-reconcile";
import type { WriteGroupsOutput } from "./execution-verdict-writer";

/**
 * 那份对账单的两条来路，各一个函数（plan §5.2 / §5.8）。
 *
 * 它们共用一个返回类型，但**绝不能共用实现**：重放（`cachedReceipt`）要把当初
 * 那句话逐字再说一遍，正常路径（`buildReceipt`）才现拼。合成一条的后果见
 * `cachedReceipt` 的注释。
 *
 * 本文件 import 了 db repository，因此不可单测；这里只剩取数与拼接，
 * 每一条条目长什么样都在 `./execution-reconcile` 那一侧（纯的、有单测）。
 */

/**
 * 重复提交一个**已完成**的幂等键：把当初那份对账单**逐字**返回（§5.2），不重写任何东西。
 *
 * 它存在 `automation_executions.receipt` 里，与 `completedAt` 同一条 UPDATE 落库。
 * 重放的语义是「把上次那句话再说一遍」，所以这里不按当前状态重算——重算的两条
 * 实测后果（`writtenTo` 被后一轮覆盖成空、另外三类拒绝一次重试就被吞掉）
 * 写在 `schema/automation-executions.ts` 的 `receipt` 列注释上。
 *
 * ## `receipt` 为 null 的历史行怎么办：**退回现算，并且只退这一种情况**
 *
 * 0009 之前写下的行没有这一列的值（本地库当时 `automation_executions` 是空的，
 * 线上也还没部署，所以这批行现实中是空集；这条分支是为「万一」留的，不是热路径）。
 * 对它们**没有**当初那份对账单可还原——库里只留下了「发生过什么」的那一半，
 * 凭空补一份完整的清单是编造。所以退回 `summarizeAutomationExecutionRuns` 现算
 * `writtenTo`、另外三个数组留空：这与 0009 之前的行为逐字一致，
 * 不新增第二种说法，也不会因为多了一列就让老记录的重放突然改口。
 * 这批行只会越来越旧、永远不会新增，随时间自然消失。
 *
 * `safeParse` 失败（存进去的形状与当前契约对不上，例如契约日后加了必填字段）
 * 走同一条降级路：一份解释不了的 JSON 与没有那份 JSON 是同一件事，
 * 而 500 会把一次**本该幂等成功**的重试打成失败。绝不 `receipt!` 硬断言。
 */
export async function cachedReceipt(
	execution: AutomationExecution
): Promise<IngestExecutionReceipt> {
	const stored = ingestExecutionReceiptSchema.safeParse(execution.receipt);
	if (stored.success) {
		return stored.data;
	}
	return {
		executionId: execution.id,
		outOfScope: [],
		skippedManual: [],
		unmatchedCases: [],
		writtenTo: await summarizeAutomationExecutionRuns(execution.id),
	};
}

export interface BuildReceiptInput {
	executionId: string;
	projectId: string;
	reconciled: ReconciledAutomationTargets;
	written: WriteGroupsOutput;
}

/**
 * 拼出这一轮**要返回给上报方、也要原样落库**的那份对账单。
 *
 * 唯一还要发 SQL 的地方是那条**诊断查询**：`reconciled.unexplained` 里是
 * 「一个可写目标都没有，而且没有任何具体任务能解释为什么」的那几条。
 * 它们落空的真实原因往往是「收它的任务已经提交了」——那种行在
 * `resolveAutomationTargets` 里就被 `submitted_at is null` 滤掉了，
 * 上层看不见，只能给出一句「不在任何未提交任务的范围内」，
 * 把人推去建任务勾用例，而真相是「该新建一个重测任务」。
 *
 * ⚠️ **只对这几条跑**（正常情况下是很少的几条，通常是 0 条），
 * 而且结果**只用于拼理由，绝不参与写入判定**——写入在上面已经全部结束了。
 */
export async function buildReceipt(
	input: BuildReceiptInput
): Promise<IngestExecutionReceipt> {
	const { reconciled, written } = input;
	const blockers = await findSubmittedRunBlockers({
		projectId: input.projectId,
		sourceRefs: reconciled.unexplained.map((entry) => entry.sourceRef),
	});
	return {
		executionId: input.executionId,
		outOfScope: [
			...reconciled.outOfScope,
			...buildUnexplainedOutOfScopeEntries(reconciled.unexplained, blockers),
			...written.outOfScope,
		],
		skippedManual: written.skippedManual,
		unmatchedCases: reconciled.unmatchedCases,
		writtenTo: written.writtenTo,
	};
}
