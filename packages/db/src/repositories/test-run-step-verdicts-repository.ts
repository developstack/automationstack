import { eq } from "drizzle-orm";

import { db } from "../index";
import { type CaseStep, testCases } from "../schema/test-cases";
import {
	type TestRun,
	type TestRunCase,
	testRunCases,
} from "../schema/test-runs";
import type { DbTransaction } from "./repository-types";
import { insertRunCaseEvents } from "./test-run-case-event-writes";
import type {
	RunCaseWriteRejection,
	RunReviewPending,
} from "./test-run-case-guards";
import {
	applyRunStatusDerivation,
	ensureRunWritable,
} from "./test-run-status-repository";
import {
	buildCaseComment,
	deriveCaseResult,
	fillStepResults,
	type JudgedSteps,
	type StepComments,
	unknownStepIds,
} from "./test-run-step-results-core";

/**
 * **分步判定的保存**：执行台上「判完每一步 → 点保存」那一下。
 *
 * 这是手工打结论的第三个入口，与 `test-run-verdicts-repository.ts` 里那两个
 * 共用同样的守卫（`ensureRunWritable`、「待评审」拒收、审计流水、
 * `applyRunStatusDerivation`），区别只在写什么：那两条是「一个用例级结论铺满
 * 每一步」，这一条反过来——**分步是输入，用例结论是推导出来的输出**。
 * `result` 与 `comment` 在这里都不接受调用方的值，全部由
 * `test-run-step-results-core.ts` 算出来。前端算的那份只是预览，绝不采信：
 * 让客户端决定用例结论，等于把通过率交给浏览器。
 *
 * 有步骤的用例走这里；没有步骤的用例走 `setRunCaseResult`（人直接点四颗按钮），
 * 两条路径互斥，由 `no-steps` 这个拒绝结果把走错门的调用挡回去。
 */

export interface SaveRunCaseStepResultsInput {
	actorId: string | null;
	/**
	 * 用户是**对着哪一版用例**判的。用例是活引用（D2），别人随时可能改步骤；
	 * 对不上就整单拒收，而不是硬保存——见 `case-changed` 的说明。
	 */
	caseVersion: number;
	/** stepId → 原因文本。落库时只有失败 / 阻塞那几步留得住，见 `pickComment`。 */
	comments: StepComments;
	/** stepId → 判定。**只含用户点过的**；没点的由服务端补成跳过。 */
	judged: JudgedSteps;
	runCaseId: string;
}

/** 用例被改过：`currentVersion` 已经不是用户判定时看到的那一版。 */
export interface RunCaseChanged {
	currentVersion: number;
	kind: "case-changed";
}

export type SaveRunCaseStepResultsOutcome =
	| RunCaseChanged
	| RunCaseWriteRejection
	| RunReviewPending
	| { kind: "no-steps" }
	| { kind: "ok"; run: TestRun; runCase: TestRunCase }
	| { kind: "unknown-steps"; stepIds: string[] };

interface StepVerdictTarget {
	caseVersion: number;
	comment: string | null;
	result: TestRunCase["result"];
	runId: string;
	steps: CaseStep[];
}

/**
 * 旧值快照 + 用例当前的步骤，**一条 SELECT，且必须在 UPDATE 之前**。
 *
 * `comment` / `result` 是审计流水里 `fromResult` 与说明快照的唯一来源；
 * `steps` 与 `currentVersion` 决定这次判定还作不作数。四样东西一次取齐，
 * 与手工那两条路径「归属校验与取旧值合成同一条 SELECT」是同一个做法。
 */
async function selectStepVerdictTarget(
	tx: DbTransaction,
	runCaseId: string
): Promise<StepVerdictTarget | null> {
	const [target] = await tx
		.select({
			caseVersion: testCases.currentVersion,
			comment: testRunCases.comment,
			result: testRunCases.result,
			runId: testRunCases.runId,
			steps: testCases.steps,
		})
		.from(testRunCases)
		.innerJoin(testCases, eq(testCases.id, testRunCases.caseId))
		.where(eq(testRunCases.id, runCaseId))
		.limit(1);
	return target ?? null;
}

/**
 * 这次判定还作不作数。
 *
 * 版本对不上时**整单拒收**，而不是「按新步骤尽力保存」：用户是对着旧的那一版
 * 逐步判的，新版可能加了一步、删了一步、把第 3 步的预期整个改了，硬存下来
 * 得到的是一份谁也没判过的结果，而且没有任何地方会报错。拒收不会让用户白干——
 * 草稿在浏览器本地（见 `use-run-step-draft.ts`），刷新后对着新步骤重判即可。
 *
 * `unknown-steps` 是防御性的：正常路径上版本一致就不可能出现认不出的 id，
 * 撞到只可能是有人手改了请求体。这时同样拒收，绝不静默丢弃那几条。
 */
function rejectStaleJudgement(
	input: SaveRunCaseStepResultsInput,
	target: StepVerdictTarget
):
	| RunCaseChanged
	| { kind: "no-steps" }
	| { kind: "unknown-steps"; stepIds: string[] }
	| null {
	if (target.steps.length === 0) {
		return { kind: "no-steps" as const };
	}
	if (target.caseVersion !== input.caseVersion) {
		return {
			currentVersion: target.caseVersion,
			kind: "case-changed" as const,
		};
	}
	const stepIds = unknownStepIds(target.steps, input.judged);
	return stepIds.length > 0
		? { kind: "unknown-steps" as const, stepIds }
		: null;
}

/**
 * 落库那一段：一条 UPDATE + 一条流水 + 状态推导，顺序不可换（理由同另两条路径）。
 *
 * `caseVersion` 这里写的是**校验时读到的那个版本号**，而不是像 `buildResultPatch`
 * 那样用相关子查询就地取。两者的目标相反：那边要的是「写下去的这一刻是哪一版」，
 * 这边要的是「用户判的是哪一版」。事务内另一个会话刚好提交了新版本时，
 * 子查询会记下一个用户从没看见过的版本号，而我们存的步骤 id 全来自旧版。
 */
async function writeStepVerdict(
	tx: DbTransaction,
	input: SaveRunCaseStepResultsInput,
	target: StepVerdictTarget,
	run: TestRun
): Promise<{ run: TestRun; runCase: TestRunCase }> {
	const stepResults = fillStepResults(
		target.steps,
		input.judged,
		input.comments
	);
	const result = deriveCaseResult(stepResults);
	const comment = buildCaseComment(target.steps, stepResults);
	const [runCase] = await tx
		.update(testRunCases)
		.set({
			caseVersion: target.caseVersion,
			comment,
			executedAt: new Date(),
			executedBy: input.actorId,
			executedVia: "manual",
			// 人刚手工判过，就不再有任何自动化执行是这条结论的来源了。
			// 不变式与 `buildResultPatch` 那条完全相同，理由见那边。
			lastAutomationExecutionId: null,
			result,
			stepResults,
		})
		.where(eq(testRunCases.id, input.runCaseId))
		.returning();
	if (!runCase) {
		throw new Error("saveRunCaseStepResults: update returned no row");
	}
	await insertRunCaseEvents(tx, {
		actorId: input.actorId,
		comment,
		snapshots: [
			{ comment: target.comment, id: input.runCaseId, result: target.result },
		],
		toResult: result,
	});
	return {
		run: await applyRunStatusDerivation(tx, { actorId: input.actorId, run }),
		runCase,
	};
}

/** 保存一条用例的分步判定，并把用例结论推导出来一起写下去。 */
export function saveRunCaseStepResults(
	input: SaveRunCaseStepResultsInput
): Promise<SaveRunCaseStepResultsOutcome> {
	return db.transaction(async (tx) => {
		const target = await selectStepVerdictTarget(tx, input.runCaseId);
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
		const stale = rejectStaleJudgement(input, target);
		if (stale !== null) {
			return stale;
		}
		const written = await writeStepVerdict(tx, input, target, run);
		return { kind: "ok" as const, run: written.run, runCase: written.runCase };
	});
}
