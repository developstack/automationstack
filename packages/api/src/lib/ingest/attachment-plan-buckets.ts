import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import type { IngestAttachmentRejection } from "./attachment-contract";

/**
 * 附件折算的**候选行分桶**（plan §5.6）：把 `resolveAutomationTargets` 的返回
 * 按 sourceRef 归拢，再把一条 sourceRef 的候选行分成「能签 / 被白名单排除 /
 * 待评审」三个桶，并给后两者拼出各自的拒绝文案。
 *
 * 与 `./attachment-reconcile` 同一个「不碰 db 运行时」的性质：这里唯一那条 db
 * import 是 `import type`（编译期擦除），因为 api 包的 vitest project 不带
 * `DATABASE_URL`，任何运行时通向 `@automationstack/db` 的边都会让测试在 import
 * 阶段就炸。判据留在这里、编排留在 `./attachment-uploads`。
 */

/**
 * 待评审的判据与文案，与 `./execution-reconcile` 里的私有同名逻辑**必须一致**。
 *
 * 那边没有导出（它是那个文件的内部判据），这里重写一遍而不是去改一个已验收的
 * 文件。两处一旦分叉，表现是「结论被待评审任务拒了，附件却签出了 URL」——
 * 传上去的对象挂不到任何行上，成为孤儿。改动其中一处时请一并改另一处。
 */
function isPendingReview(row: AutomationTargetRow): boolean {
	return row.runStatus === "pending_review";
}

export function describePendingReview(runName: string): string {
	return `测试任务「${runName}」还在待评审，不接受附件`;
}

/**
 * 「这个任务是候选，但你这轮的 `runIds` 没带它」。
 *
 * 与 `REASON_NO_CANDIDATE_RUN` **必须是两句不同的话**：那一句会把人推向
 * 「去某个任务里追加这条用例」（D24），而这里真正该改的是 CI 里的白名单——
 * 任务是现成的、也确实是未提交的候选，只是这一轮自己把它排除了。
 * 所以理由里点名任务，否则人只知道「被白名单挡了」，仍然不知道该往里加哪个 id。
 *
 * 措辞与 `./execution-reconcile` 的 `describeRunIdsExcluded` 对齐，只把
 * 「结论未写入」换成附件自己的说法：那边的白名单与这边是同一个值
 * （`ingestAttachmentPresignRequestSchema.runIds` 明写「必须一起传」），
 * 一次收窄的两条路径不该给出两种口径的解释。
 */
export function describeRunIdsExcluded(runName: string): string {
	return `测试任务「${runName}」是这条用例的候选（未提交），但本轮的 runIds 白名单没有带上它，附件未获签名`;
}

export function groupRowsBySourceRef(
	rows: AutomationTargetRow[]
): Map<string, AutomationTargetRow[]> {
	const bySourceRef = new Map<string, AutomationTargetRow[]>();
	for (const row of rows) {
		const bucket = bySourceRef.get(row.sourceRef);
		if (bucket) {
			bucket.push(row);
			continue;
		}
		bySourceRef.set(row.sourceRef, [row]);
	}
	return bySourceRef;
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
	/** 是候选，但还在待评审、不接受附件的任务名。 */
	pendingReviewRunNames: string[];
	/** 真能签的那些格子。 */
	targets: WritableTarget[];
}

/**
 * 把一条 sourceRef 的候选行分进三个桶（与 `reconcileAutomationTargets` 里的
 * 同名私有函数一一对应，那边是结论、这边是附件）。
 *
 * 三个 null 判断不能省成一个：LEFT JOIN 未命中时三列一起是 null，
 * 但 TypeScript 只认逐列收窄。
 *
 * ⚠️ **判定顺序即优先级：白名单排除排在待评审之前。** 一个任务同时被白名单排除
 * 又在待评审时，说「它还在待评审」是在暗示「评审完就会签出 URL」——而这轮压根
 * 不打算往它那儿传，那是调用方自己下的指令。给出的理由必须是那条真正生效的。
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

/**
 * 某个具体任务挡下这一条时的逐条拒绝：一个任务一条，各指各的名。
 *
 * 与「不在任何未提交任务的范围内」那句 `runName: null` 的拒绝**必须分开**：
 * 那一句让人去把用例勾进任务，而这里任务是现成的，人要改的是别的东西
 * （评审完成 / CI 里的白名单）。
 */
export function buildBlockedRejections(
	index: number,
	sourceRef: string,
	runNames: string[],
	describe: (runName: string) => string
): IngestAttachmentRejection[] {
	return runNames.map((runName) => ({
		index,
		reason: describe(runName),
		runName,
		sourceRef,
	}));
}
