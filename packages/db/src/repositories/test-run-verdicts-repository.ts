import { eq, inArray, type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import { testCases } from "../schema/test-cases";
import { testRunCaseEvents } from "../schema/test-run-case-events";
import {
	type TestRun,
	type TestRunCase,
	type TestRunCaseResult,
	testRunCases,
} from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";
import {
	type BuildRunCaseEventRowsInput,
	buildRunCaseEventRows,
} from "./test-run-case-events-core";
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

/**
 * **打结论**：执行台上最高频的那类写操作（单条与批量）。
 *
 * 单独成文件的核心是 `buildResultPatch`——回退成 `untested` 要连带清掉哪些字段、
 * 非 untested 时 `comment` 为什么只在显式给值时才写，这些判断只在打结论这条
 * 路径上成立，混进范围管理里会被当成通用逻辑复用出错。
 */

interface ResultPatchInput {
	actorId: string | null;
	comment?: string | null;
	result: TestRunCaseResult;
}

/** `caseVersion` 走相关子查询，因此这里要能放 SQL 片段而不只是数字。 */
interface RunCaseResultPatch {
	caseVersion?: SQL | null;
	comment?: string | null;
	executedAt?: Date | null;
	executedBy?: string | null;
	result: TestRunCaseResult;
}

/**
 * 结论字段的写入内容。
 *
 * 回退成 `untested` 时把 `executedAt` / `executedBy` / `caseVersion` 一并抹掉：
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
 */
function buildResultPatch(input: ResultPatchInput): RunCaseResultPatch {
	const patch: RunCaseResultPatch = { result: input.result };
	if (input.comment !== undefined) {
		patch.comment = input.comment;
	}
	if (input.result === "untested") {
		patch.caseVersion = null;
		patch.comment = null;
		patch.executedAt = null;
		patch.executedBy = null;
		return patch;
	}
	patch.executedAt = new Date();
	patch.executedBy = input.actorId;
	// 打结论那一刻的用例版本号（plan §3.3）。用相关子查询就地取，
	// 而不是先 select 再回填：中间隔一次往返，别人正好保存了新版本，
	// 记下的就会是一个这条结论从没见过的版本号。
	patch.caseVersion = sql`(select ${testCases.currentVersion} from ${testCases} where ${testCases.id} = ${testRunCases.caseId})`;
	return patch;
}

/**
 * 落审计流水：**一条多行 INSERT**，且没有可记的行时一条 SQL 都不发。
 *
 * 单条与批量两条路径共用它，是为了让「什么时候不记、说明记哪一段」
 * 只有 `buildRunCaseEventRows` 一处判定；两边各写各的迟早会漂成两套语义。
 */
async function insertRunCaseEvents(
	tx: DbTransaction,
	input: BuildRunCaseEventRowsInput
): Promise<void> {
	const rows = buildRunCaseEventRows(input);
	if (rows.length === 0) {
		return;
	}
	await tx.insert(testRunCaseEvents).values(rows);
}

export interface SetRunCaseResultInput {
	actorId: string | null;
	comment?: string | null;
	result: TestRunCaseResult;
	runCaseId: string;
}

export type SetRunCaseResultOutcome =
	| RunCaseWriteRejection
	| RunReviewPending
	| { kind: "ok"; run: TestRun; runCase: TestRunCase };

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
		// 这一条 SELECT 顺带把旧结论与旧说明取回来（**必须在 UPDATE 之前**）：
		// 它们是审计流水里 `fromResult` 与说明快照的唯一来源，多带两列不多一次往返。
		const [target] = await tx
			.select({
				comment: testRunCases.comment,
				result: testRunCases.result,
				runId: testRunCases.runId,
			})
			.from(testRunCases)
			.where(eq(testRunCases.id, input.runCaseId))
			.limit(1);
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
				{
					comment: target.comment,
					id: input.runCaseId,
					result: target.result,
				},
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
