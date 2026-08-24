import type { TestRun, TestRunStatus } from "../schema/test-runs";

/**
 * 状态推导只依赖这两个数：测试任务里一共有多少条用例、其中多少条还没结论。
 *
 * 单独抽成纯函数（而不是写在事务里）是因为它是整个测试任务最容易出错、
 * 也最难在真库上复现的一段逻辑：ready→in_progress→completed 的连跳、
 * 空任务不许算完成、submitted 绝不再动——这些分支只有拿纯函数逐个钉住，
 * 才不用靠「跑一遍界面看看」来验证。事务里那部分只负责取数、落库和记事件。
 */
export interface RunConclusionCounts {
	total: number;
	untested: number;
}

/**
 * 推出本次写操作应当产生的状态流转链（plan §4.1 第 ③ 步），按发生顺序返回。
 * 空数组表示状态不变——**不变才是常态**（每打一条结论都会走到这里）。
 *
 * 返回的是「链」而不是单个目标状态，因为一次写操作可能跨两级：`ready` 的测试任务被
 * 「一键全部通过」一把打完，事实上先开测再完成，两条流转都真实发生过，
 * 只记末态会让 `startedAt` 和审计流水里凭空少掉「开测」这一环。
 *
 * 几个不显然的边界：
 * - `total === 0` 时不判完成。空测试任务的「没有 untested 行」是真空真理，
 *   把刚建的空任务标成「已完成」，接着自动提交就会把它永久锁死。
 * - `pending_review` 不会被推进：评审是线下开会后人工签字的（D4），
 *   平台无从判断会开完了没有，只能等 `markReviewed`。
 * - `submitted` 不会被推进：终态，且到这一步之前调用方已经被
 *   `ensureRunWritable` 挡在门外了，这里是第二道保险。
 * - `in_progress` 不会退回 `ready`：`startedAt` 已经记下「曾经开测」，
 *   抹掉它就是伪造历史（plan §2.1）。所以把结论全撤光只会停在 `in_progress`。
 */
export function deriveRunStatusSteps(
	currentStatus: TestRunStatus,
	counts: RunConclusionCounts
): TestRunStatus[] {
	const hasCases = counts.total > 0;
	const allConcluded = hasCases && counts.untested === 0;
	const hasConclusion = counts.total - counts.untested > 0;
	if (currentStatus === "ready" && hasConclusion) {
		return allConcluded ? ["in_progress", "completed"] : ["in_progress"];
	}
	if (currentStatus === "in_progress" && allConcluded) {
		return ["completed"];
	}
	if (currentStatus === "completed" && counts.untested > 0) {
		return ["in_progress"];
	}
	return [];
}

/** 目标测试任务已提交并锁死；`submittedAt` 给 router 拼「已于 X 锁定」的文案。 */
export interface RunLocked {
	kind: "locked";
	submittedAt: Date;
}

export interface RunWritableOk {
	kind: "ok";
	run: TestRun;
}

export type RunWritableResult =
	| RunLocked
	| RunWritableOk
	| { kind: "not-found" };

/**
 * `submitted` 终态守卫的判定部分。调用方（`ensureRunWritable`）必须先在事务内
 * 对 `test_runs` 行加 `FOR UPDATE` 再把行传进来——判定本身是纯的，
 * 真正防住 TOCTOU 的是那把行锁，不是这个函数。
 */
export function evaluateRunWritable(
	run: TestRun | undefined
): RunWritableResult {
	if (!run) {
		return { kind: "not-found" };
	}
	if (run.submittedAt !== null) {
		return { kind: "locked", submittedAt: run.submittedAt };
	}
	return { kind: "ok", run };
}

export interface SubmitAlreadySubmitted {
	kind: "already-submitted";
	run: TestRun;
}

export type SubmitTestRunRejection =
	| SubmitAlreadySubmitted
	| { kind: "invalid-status"; status: TestRunStatus }
	| { kind: "not-found" };

export type SubmitTestRunResult =
	| SubmitTestRunRejection
	| { kind: "submitted"; run: TestRun };

/**
 * 条件 UPDATE（`WHERE submitted_at IS NULL AND status = 'completed'`）更新了 0 行时，
 * 回读该行解释原因。
 *
 * **重复提交必须是幂等的，不是异常**：两个人同时点「提交报告」，或者一个人手滑
 * 点了两下，第二次拿到的是「这个测试任务已经提交过了」这个事实 + 提交人和时间，
 * 界面直接切到已提交视图即可。把它做成 500 会让用户以为提交失败而去重试，
 * 而重试永远不会成功——这正是最容易让人误以为系统坏了的失败模式。
 */
export function classifySubmitRejection(
	run: TestRun | undefined
): SubmitTestRunRejection {
	if (!run) {
		return { kind: "not-found" };
	}
	if (run.submittedAt !== null) {
		return { kind: "already-submitted", run };
	}
	return { kind: "invalid-status", status: run.status };
}
