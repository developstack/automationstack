import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import type {
	AutomationCaseResult,
	IngestExecutionResult,
} from "./execution-contract";
import { normalizeIngestComment } from "./execution-results-normalize";

/**
 * 一条 sourceRef 的候选行 → **写入计划**：分桶（谁能写、谁被挡下、被谁挡下）
 * 与按任务分组（plan §5.1.1 / §5.3 / §5.8）。
 *
 * 这里是这个端点里唯一真正会写错的地方，所以它与拼理由（`./execution-reason-text`）
 * 和编排（`./execution-ingest`）分开，单独待在能被单测钉死的一侧：
 * 「用例不存在」和「没人收这条用例」错分成一类，表现是人照着对账单去改
 * `AS_PROJECT`，而实际该做的是把用例勾进任务。
 *
 * 与 `./execution-reconcile` 一样必须保持纯：唯一那条 db import 是 `import type`
 * （编译期擦除），理由见那边的文件头。
 */

/** 一条要写进某个 run_case 的结论；`sourceRef` 只为回填对账单，db 层不看它。 */
export interface AutomationWriteItem {
	comment: string | null;
	result: AutomationCaseResult;
	runCaseId: string;
	sourceRef: string;
}

/**
 * 一个测试任务一组，**一组一个事务**（§5.3 / §5.5）。
 *
 * 分组不是为了好看：`ensureRunWritable` 对 `test_runs` 行加 `FOR UPDATE`，
 * 跨任务合并成一个事务就要按不确定的顺序去抢多把行锁，两个 suite 并发跑
 * 立刻互相死等。N 个事务的 N 现实里是 1～3。
 */
export interface AutomationWriteGroup {
	items: AutomationWriteItem[];
	runId: string;
	runName: string;
}

/** 一条 sourceRef 落在某个可写任务上的那一格；三个字段在 SQL 里是可空的。 */
export interface WritableTarget {
	runCaseId: string;
	runId: string;
	runName: string;
}

/** 一条 sourceRef 的候选行分完桶之后的样子。三个桶互斥，合起来就是它的全部候选。 */
export interface CandidateBuckets {
	/** 是候选（未提交），但被本轮 `runIds` 白名单排除的任务名。 */
	excludedRunNames: string[];
	/** 是候选，但还在待评审、不接受结论的任务名。 */
	pendingReviewRunNames: string[];
	/** 真能写的那些格子。 */
	targets: WritableTarget[];
}

/**
 * 一条落空、且**没有任何具体任务能解释为什么落空**的结果。
 *
 * 它不是第四个桶，只是一份「还差一次诊断查询才能给出理由」的待办：
 * 上层拿它去问 `findSubmittedRunBlockers`（收它的任务是不是都已经提交了），
 * 再由 `buildUnexplainedOutOfScopeEntries` 折算成最终的 `outOfScope` 条目。
 * 分成两步是因为那次诊断要发 SQL，而本文件必须保持纯（见文件头）。
 */
export interface UnexplainedSourceRef {
	caseId: string;
	sourceRef: string;
}

/**
 * 待评审的任务本来就是候选（它的 `submitted_at` 是 null），但要在**发事务之前**
 * 就摘出来（§5.8 第三行）。
 *
 * `applyAutomationVerdicts` 自己也会返回 `review-pending`，靠它兜底同样拦得住，
 * 但那要先开一个事务、抢一把行锁、再回滚——为一个查询时就已经知道答案的事。
 * 更要紧的是理由：这里能说出「测试任务『X』还在待评审」，兜底那条路只知道
 * 「有个任务拒了」。评审没结束意味着用例清单还可能增删，对着没定稿的清单打结论
 * ——人打的还是脚本打的都一样——会让评审会上看到的东西已经被污染。
 */
function isPendingReview(row: AutomationTargetRow): boolean {
	return row.runStatus === "pending_review";
}

/**
 * 把一条 sourceRef 的候选行分进三个桶。
 *
 * 三个 null 判断不能省成一个：LEFT JOIN 未命中时三列一起是 null，
 * 但 TypeScript 只认逐列收窄，写成 `row.runId !== null` 一句，
 * 下面 `runCaseId` 还是 `string | null`。
 *
 * ⚠️ **判定顺序即优先级：白名单排除排在待评审之前。** 一个任务同时被白名单排除
 * 又在待评审时，说「它还在待评审」是在暗示「评审完就会写进去」——而这轮压根
 * 不打算写它，那是调用方自己下的指令。给出的理由必须是那条真正生效的。
 */
export function bucketCandidateRows(
	rows: AutomationTargetRow[],
	allowedRunIds: Set<string> | null
): CandidateBuckets {
	const buckets: CandidateBuckets = {
		excludedRunNames: [],
		pendingReviewRunNames: [],
		targets: [],
	};
	for (const row of rows) {
		if (row.runCaseId === null || row.runId === null || row.runName === null) {
			continue;
		}
		if (allowedRunIds !== null && !allowedRunIds.has(row.runId)) {
			buckets.excludedRunNames.push(row.runName);
			continue;
		}
		if (isPendingReview(row)) {
			buckets.pendingReviewRunNames.push(row.runName);
			continue;
		}
		buckets.targets.push({
			runCaseId: row.runCaseId,
			runId: row.runId,
			runName: row.runName,
		});
	}
	return buckets;
}

function pushWriteItem(
	groupByRunId: Map<string, AutomationWriteGroup>,
	target: WritableTarget,
	item: AutomationWriteItem
): void {
	const group = groupByRunId.get(target.runId);
	if (group) {
		group.items.push(item);
		return;
	}
	groupByRunId.set(target.runId, {
		items: [item],
		runId: target.runId,
		runName: target.runName,
	});
}

/** 一条结果落进它全部可写目标：`comment` 只折算一次，各组共用同一个值。 */
export function pushResultItems(
	groupByRunId: Map<string, AutomationWriteGroup>,
	result: IngestExecutionResult,
	targets: WritableTarget[]
): void {
	const comment = normalizeIngestComment(result.message);
	for (const target of targets) {
		pushWriteItem(groupByRunId, target, {
			comment,
			result: result.result,
			runCaseId: target.runCaseId,
			sourceRef: result.sourceRef,
		});
	}
}
