import { eq, inArray } from "drizzle-orm";

import { db } from "../index";
import {
	type TestRun,
	type TestRunCase,
	type TestRunCaseResult,
	type TestRunExecutedVia,
	testRunCases,
} from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";
import { insertRunCaseEvents } from "./test-run-case-event-writes";
import {
	dedupe,
	findMissingRunCaseIds,
	type InvalidRunCases,
	type RunCaseWriteRejection,
	type RunReviewPending,
	selectRunCaseVerdictSnapshots,
} from "./test-run-case-guards";
import {
	applyRunStatusDerivation,
	ensureRunWritable,
} from "./test-run-status-repository";
import { buildResultPatch } from "./test-run-verdict-patch";

/**
 * **打结论**：执行台上最高频的那类写操作（单条与批量）。
 *
 * 本文件留的是**手工**两条路径。同一条写路径的第三个入口——自动化上报——
 * 在 `test-run-automation-verdicts.ts`，它与这里共用同样的四道守卫
 * （`ensureRunWritable`、「待评审」拒收、`applyRunStatusDerivation`、
 * `buildRunCaseEventRows` + 一条 INSERT），只是 UPDATE 的写法不同；
 * 那个文件的导出在下面原样 re-export，
 * `@automationstack/db/repositories/test-run-verdicts-repository` 这条路径上
 * 此前能取到的每一个符号仍然在原处。
 *
 * 另外两块被摘出去的东西：结论字段的 patch 构造在 `test-run-verdict-patch.ts`，
 * 审计流水的写侧原语在 `test-run-case-event-writes.ts`——两者都由手工与自动化
 * 三条路径共用，理由分别写在那两个文件的文件头。
 */

export type {
	ApplyAutomationVerdictsInput,
	ApplyAutomationVerdictsOutcome,
	AutomationVerdictItem,
} from "./test-run-automation-verdicts";
// biome-ignore lint/performance/noBarrelFile: 兼容性 re-export，不是 barrel——自动化上报那条路径本来就定义在本文件里，拆去 test-run-automation-verdicts.ts 只为行数与函数长度上限，调用方的导入路径必须保持不变
export { applyAutomationVerdicts } from "./test-run-automation-verdicts";

export interface SetRunCaseResultInput {
	actorId: string | null;
	comment?: string | null;
	result: TestRunCaseResult;
	runCaseId: string;
	/** 必填，理由见 `ResultPatchInput.via`。手工路径显式传 `"manual"`。 */
	via: TestRunExecutedVia;
}

export type SetRunCaseResultOutcome =
	| RunCaseWriteRejection
	| RunReviewPending
	| { kind: "ok"; run: TestRun; runCase: TestRunCase };

/**
 * 单条路径的旧值快照。
 *
 * 这一条 SELECT 顺带把旧结论与旧说明取回来（**必须在 UPDATE 之前**）：
 * 它们是审计流水里 `fromResult` 与说明快照的唯一来源，多带两列不多一次往返。
 * `runId` 一并带回，`setRunCaseResult` 据此反查归属（见那边的注释）。
 */
async function selectRunCaseVerdictTarget(
	tx: DbTransaction,
	runCaseId: string
) {
	const [target] = await tx
		.select({
			comment: testRunCases.comment,
			result: testRunCases.result,
			runId: testRunCases.runId,
		})
		.from(testRunCases)
		.where(eq(testRunCases.id, runCaseId))
		.limit(1);
	return target ?? null;
}

/**
 * 打（或回退）单条结论——执行台上最高频的写操作。
 *
 * `runId` 由 run_case 行反查而不是让调用方传：run_case 的归属永远不变，
 * 先读后锁不构成 TOCTOU；而多要一个参数就多一处「前端传错测试任务 id」的可能。
 */
export function setRunCaseResult(
	input: SetRunCaseResultInput
): Promise<SetRunCaseResultOutcome> {
	return db.transaction(async (tx) => {
		const target = await selectRunCaseVerdictTarget(tx, input.runCaseId);
		if (!target) {
			return { kind: "not-found" as const };
		}
		const writable = await ensureRunWritable(tx, target.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		if (run.status === "pending_review") {
			return { kind: "review-pending" as const };
		}
		const [runCase] = await tx
			.update(testRunCases)
			.set(buildResultPatch(input))
			.where(eq(testRunCases.id, input.runCaseId))
			.returning();
		if (!runCase) {
			throw new Error("setRunCaseResult: update returned no row");
		}
		// 结论与流水必须同生共死：写了结论没写流水，比压根没有流水更糟——
		// 时间线看着完整，缺的那一环没有任何迹象。故就在同一个事务里，
		// 且用同一份 `input`（结论没变时 `buildRunCaseEventRows` 返回空数组）。
		await insertRunCaseEvents(tx, {
			actorId: input.actorId,
			comment: input.comment,
			snapshots: [
				{ comment: target.comment, id: input.runCaseId, result: target.result },
			],
			toResult: input.result,
		});
		const updated = await applyRunStatusDerivation(tx, {
			actorId: input.actorId,
			run,
		});
		return { kind: "ok" as const, run: updated, runCase };
	});
}

export interface BulkSetRunCaseResultInput {
	actorId: string | null;
	result: TestRunCaseResult;
	runCaseIds: string[];
	/** 必传，理由同 `AssignRunCasesInput.runId`（避免跨测试任务批量的有序加锁）。 */
	runId: string;
	/** 必填，理由见 `ResultPatchInput.via`。 */
	via: TestRunExecutedVia;
}

export type BulkSetRunCaseResultOutcome =
	| InvalidRunCases
	| RunCaseWriteRejection
	| RunReviewPending
	| { kind: "ok"; run: TestRun; runCaseIds: string[] };

/**
 * 批量打结论（「一键全部通过」走这里）。
 *
 * 整批走一条 UPDATE 而不是循环调 `setRunCaseResult`：后者是 N 次事务、
 * N 次行锁、N 次状态推导，中途失败还会留下改了一半的测试任务。
 */
export function bulkSetRunCaseResult(
	input: BulkSetRunCaseResultInput
): Promise<BulkSetRunCaseResultOutcome> {
	return db.transaction(async (tx) => {
		const writable = await ensureRunWritable(tx, input.runId);
		if (writable.kind !== "ok") {
			return writable;
		}
		const { run } = writable;
		if (run.status === "pending_review") {
			return { kind: "review-pending" as const };
		}
		const runCaseIds = dedupe(input.runCaseIds);
		// 归属校验与「取旧值」合成同一条 SELECT，且在 UPDATE 之前：
		// 整条批量路径的 SQL 条数因此没有增加（原本的归属校验就是一条 SELECT），
		// 只是多带回两列。绝不能改成逐条查旧值——那正是本文件反复警告的 N 次往返。
		const snapshots = await selectRunCaseVerdictSnapshots(
			tx,
			run.id,
			runCaseIds
		);
		const invalidRunCaseIds = findMissingRunCaseIds(runCaseIds, snapshots);
		if (invalidRunCaseIds.length > 0) {
			return { invalidRunCaseIds, kind: "invalid-run-cases" as const };
		}
		if (runCaseIds.length === 0) {
			return { kind: "ok" as const, run, runCaseIds: [] };
		}
		const updatedRows = await tx
			.update(testRunCases)
			.set(buildResultPatch(input))
			.where(inArray(testRunCases.id, runCaseIds))
			.returning({ id: testRunCases.id });
		// 整批一条 INSERT。「一键全部通过」里本来就已经通过的那些行不会进流水
		// （`fromResult === toResult`），所以这条语句的行数通常少于选中数。
		await insertRunCaseEvents(tx, {
			actorId: input.actorId,
			snapshots,
			toResult: input.result,
		});
		const updated = await applyRunStatusDerivation(tx, {
			actorId: input.actorId,
			run,
		});
		return {
			kind: "ok" as const,
			run: updated,
			runCaseIds: updatedRows.map((row) => row.id),
		};
	});
}
