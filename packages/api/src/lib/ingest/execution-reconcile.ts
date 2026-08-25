import type { AutomationTargetRow } from "@automationstack/db/repositories/automation-ingest-repository";

import type {
	IngestExecutionResult,
	IngestOutOfScopeEntry,
	IngestUnmatchedCaseEntry,
} from "./execution-contract";
import {
	describePendingReview,
	describeRunIdsExcluded,
	REASON_UNMATCHED,
} from "./execution-reason-text";
import {
	type AutomationWriteGroup,
	bucketCandidateRows,
	pushResultItems,
	type UnexplainedSourceRef,
} from "./execution-write-plan";

/**
 * 上报结果 → 四个桶的**纯折算**（plan §5.1.1 / §5.3 / §5.8）。
 *
 * 这里一行 SQL 都不发，唯一那条 db import 是 `import type`（编译期擦除），
 * 几个兄弟模块（`./execution-reason-text`、`./execution-write-plan`、
 * `./execution-results-normalize`、`./execution-receipt-entries`）同样如此。
 * 这不是洁癖：api 包的 vitest project 不带 `DATABASE_URL`，
 * 任何运行时通向 `@automationstack/db` 的边都会让测试在 import 阶段就炸
 * （`auth/bearer-token.ts` 顶部记着同一件事）。分桶规则是这个端点里
 * 唯一真正会写错的地方——「用例不存在」和「没人收这条用例」错分成一类，
 * 表现是人照着对账单去改 `AS_PROJECT`，而实际该做的是把用例勾进任务。
 * 所以它必须待在能被单测钉死的一侧，编排（`./execution-ingest`）只剩按顺序调用。
 *
 * 本文件只留「按 `results` 的顺序把候选行折算成四个桶」这一件事；
 * 判定用到的三样东西各自成文件（拼理由 / 分桶与分组 / 请求自身的折算），
 * 它们原先都定义在这里，现在**照旧从本路径 re-export**（见文件末）。
 */

export interface ReconciledAutomationTargets {
	groups: AutomationWriteGroup[];
	outOfScope: IngestOutOfScopeEntry[];
	/** 见 `UnexplainedSourceRef`：待诊断，**还不是**对账单里的一条。 */
	unexplained: UnexplainedSourceRef[];
	unmatchedCases: IngestUnmatchedCaseEntry[];
}

export interface ReconcileAutomationTargetsInput {
	/** 请求里的 results，**必须已经过 `findDuplicateSourceRefs` 的整批拒绝**。 */
	results: IngestExecutionResult[];
	/** `resolveAutomationTargets` 的原样返回，含 LEFT JOIN 出来的右半边全 null 的行。 */
	rows: AutomationTargetRow[];
	/**
	 * §5.1.1 的 `runIds` 白名单，**收窄在这一层做，不在 SQL 里做**。
	 *
	 * `null` = 不收窄，全部候选；非 null = 候选先与它取交集；空数组同样合法，
	 * 含义是「这轮谁都不写」，与 `null` 完全不同——两者的差别必须活到这里，
	 * 否则「不传」和「传了个空的」会给出一模一样的对账单。
	 *
	 * 从前它是 `resolveAutomationTargets` 里 LEFT JOIN ON 子句上的一个谓词，
	 * 于是被排除的候选任务在 SQL 阶段就消失了，这一层看到的是「没有任何 runCase」，
	 * 与「真的不在任何未提交任务里」无法区分，只能给出一句假话
	 * （RunA 明明是未提交的候选，只是这轮没带它）。挪到这里之后被排除的候选可见，
	 * 于是能给出一条指名道姓的独立理由。
	 */
	runIds: string[] | null;
}

function groupRowsBySourceRef(
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

function buildRunBlockedEntries(
	caseId: string,
	sourceRef: string,
	runNames: string[],
	describe: (runName: string) => string
): IngestOutOfScopeEntry[] {
	return runNames.map((runName) => ({
		caseId,
		reason: describe(runName),
		runName,
		sourceRef,
	}));
}

/**
 * 四个桶的累加器。做成一个对象只是为了让每条结果的折算能单独成函数
 * （见 `reconcileOneResult`）；四个数组的**追加顺序**就是对账单的行序。
 */
interface ReconcileAccumulator {
	groupByRunId: Map<string, AutomationWriteGroup>;
	outOfScope: IngestOutOfScopeEntry[];
	unexplained: UnexplainedSourceRef[];
	unmatchedCases: IngestUnmatchedCaseEntry[];
}

/**
 * 一条结果的折算。判据，**顺序即优先级**：
 * 1. 一行都解析不到 → `unmatchedCases`（项目里没有这条 sourceRef，没有 `caseId` 可给）；
 * 2. 落在待评审任务上的那几条 → `outOfScope`，并指名是哪个任务；
 * 3. 有可写目标 → 按 runId 分组，进 `groups`；
 * 4. 一个可写目标都没有，但有具体任务能解释（被本轮白名单排除 / 待评审）
 *    → `outOfScope`，逐个任务各一条，各说各的理由；
 * 5. 一个可写目标、一条解释都没有 → `unexplained`，等上层的诊断查询定夺
 *    （「收它的任务已经提交了」还是真的「不在任何未提交任务的范围内」）。
 *
 * ⚠️ 全部 `outOfScope` 条目都带 `caseId`，但**绝不能与 1 合并**：
 * 那边人该做的是「检查 `AS_PROJECT` 和用例上的 sourceRef」，这边是
 * 「把用例勾进任务 / 改 CI 的白名单 / 新建重测任务」。`resolveAutomationTargets`
 * 用 LEFT JOIN 而不是设计稿里那条 INNER JOIN，图的就是让这两件事在一条 SQL 里分开——
 * 在这里把它们揉回一个数组，等于把那个 LEFT JOIN 退化回 INNER JOIN 的语义。
 *
 * ⚠️ **一条结果只给一个最贴切的解释，绝不叠加互相矛盾的理由**：已经说明过是哪个
 * 任务挡的之后，就不再补一条「不在任何未提交任务的范围内」——那是假话。
 * 反过来，逐个任务各一条不算叠加：它们各自指名不同的任务，读起来不矛盾。
 */
function reconcileOneResult(
	acc: ReconcileAccumulator,
	result: IngestExecutionResult,
	rows: AutomationTargetRow[],
	allowedRunIds: Set<string> | null
): void {
	const [firstRow] = rows;
	if (!firstRow) {
		acc.unmatchedCases.push({
			reason: REASON_UNMATCHED,
			sourceRef: result.sourceRef,
		});
		return;
	}
	// 同一项目内 sourceRef 唯一（`test_cases_project_id_source_ref_uq`），
	// 所以这几行必定共用一个 caseId，取第一行即可。
	const { caseId } = firstRow;
	const buckets = bucketCandidateRows(rows, allowedRunIds);
	// 待评审的逐条列出，**哪怕这条用例在别的任务里写成功了**：那是平台单方面
	// 拒收，上报方没要求过，不说他就不知道。
	acc.outOfScope.push(
		...buildRunBlockedEntries(
			caseId,
			result.sourceRef,
			buckets.pendingReviewRunNames,
			describePendingReview
		)
	);
	if (buckets.targets.length > 0) {
		// 白名单排除**不在这里列出**：写成功的时候把调用方自己下的指令再回读一遍，
		// 只会让对账单里每条成功的结果都拖一行「越界」，把真正的越界淹掉。
		// 它只在这条结果一个格子都没写进去时才是答案（见下）。
		pushResultItems(acc.groupByRunId, result, buckets.targets);
		return;
	}
	const excluded = buildRunBlockedEntries(
		caseId,
		result.sourceRef,
		buckets.excludedRunNames,
		describeRunIdsExcluded
	);
	acc.outOfScope.push(...excluded);
	if (excluded.length === 0 && buckets.pendingReviewRunNames.length === 0) {
		acc.unexplained.push({ caseId, sourceRef: result.sourceRef });
	}
}

/**
 * 把解析出的三元组折算成四个桶里的三个（`skippedManual` 只有写完才知道）。
 *
 * 按 `results` 的顺序遍历而不是按 `rows`：对账单的行序于是与 SDK 自己报的顺序
 * 一致，人对着日志逐行核对时不用来回找。单条的判据与那几条红线见
 * `reconcileOneResult`。
 */
export function reconcileAutomationTargets(
	input: ReconcileAutomationTargetsInput
): ReconciledAutomationTargets {
	const rowsBySourceRef = groupRowsBySourceRef(input.rows);
	// `null` 与空数组的差别必须活到这里：`null` 不收窄，空 Set 谁都不写（§5.1.1）。
	const allowedRunIds =
		input.runIds === null ? null : new Set<string>(input.runIds);
	const acc: ReconcileAccumulator = {
		groupByRunId: new Map(),
		outOfScope: [],
		unexplained: [],
		unmatchedCases: [],
	};
	for (const result of input.results) {
		const rows = rowsBySourceRef.get(result.sourceRef) ?? [];
		reconcileOneResult(acc, result, rows, allowedRunIds);
	}
	return {
		groups: [...acc.groupByRunId.values()],
		outOfScope: acc.outOfScope,
		unexplained: acc.unexplained,
		unmatchedCases: acc.unmatchedCases,
	};
}

/**
 * 以下全是 re-export，**不是 barrel**：这些符号从前就定义在本文件里，
 * 拆文件是为了过 300 行的门禁，而 `./execution-ingest`、单测与任何日后的调用方
 * 仍然从这一个路径拿到它们。定义搬走了，导出面一个字都没变。
 */
// biome-ignore lint/performance/noBarrelFile: 不是 barrel，是搬走定义后保住的导出面，见上
export { describeRunWriteRejection } from "./execution-reason-text";
export {
	buildCaseIdBySourceRef,
	buildGroupOutOfScopeEntries,
	buildSkippedManualEntries,
	buildUnexplainedOutOfScopeEntries,
	buildWrittenToEntry,
} from "./execution-receipt-entries";
export {
	findDuplicateSourceRefs,
	normalizeIngestComment,
} from "./execution-results-normalize";
export type {
	AutomationWriteGroup,
	AutomationWriteItem,
	UnexplainedSourceRef,
} from "./execution-write-plan";
