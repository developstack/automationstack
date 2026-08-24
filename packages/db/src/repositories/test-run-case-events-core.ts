import type { NewTestRunCaseEvent } from "../schema/test-run-case-events";
import type { TestRunCaseResult } from "../schema/test-runs";

/**
 * 「这次打结论该不该留流水、流水里的说明记哪一段文字」的纯判定。
 *
 * 抽成纯函数而不是写在事务里，理由与 `test-run-status-core.ts` 相同：
 * 这两个判断都只在真库上跑一遍界面才能看出对错，而它们错了不会报错，
 * 只会让审计流水悄悄地少一条、或者把一段不该记的文字记成「他当时的理由」。
 * 事务那边只负责取旧值、落库，不做任何判断。
 */

/** 变更**之前**该行的样子：来源结论 + 那一刻挂在行上的说明。 */
export interface RunCaseVerdictSnapshot {
	comment: string | null;
	id: string;
	result: TestRunCaseResult;
}

export interface BuildRunCaseEventRowsInput {
	actorId: string | null;
	/**
	 * 调用方**显式**给的说明。`undefined` 表示没给（`buildResultPatch` 的语义是
	 * 「没给就不动原值」），`null` 表示显式清空。批量路径永远不传。
	 */
	comment?: string | null;
	snapshots: RunCaseVerdictSnapshot[];
	toResult: TestRunCaseResult;
}

/**
 * 记进流水的说明文字。
 *
 * - 回退成 `untested`：一律记**变更前**那段。`buildResultPatch` 在这条路径上会把
 *   `comment` 清成 null，那段文字正是「他当时为什么判失败」的唯一证据，
 *   不在这里留档就永久消失了；同时这条路径上调用方给的说明根本不会被写进行里
 *   （补丁最后无条件覆盖成 null），记它等于记一段从未生效过的文字。
 * - 其余结论：调用方显式给了就记它（那就是这次变更当时写下的理由，含显式清空）；
 *   没给则行上的说明不动，变更生效后的值就等于变更前的值，记快照即可。
 */
function pickEventComment(
	input: BuildRunCaseEventRowsInput,
	snapshot: RunCaseVerdictSnapshot
): string | null {
	if (input.toResult === "untested") {
		return snapshot.comment;
	}
	return input.comment === undefined ? snapshot.comment : input.comment;
}

/**
 * 把一次（单条或整批）结论变更折算成要插入的流水行，按入参顺序返回。
 * 空数组表示这次变更不该在时间线上留下任何东西——调用方据此跳过 INSERT。
 *
 * **结论没变的行会被剔掉**：重复点同一个结论（键盘快捷键连按、
 * 「一键全部通过」里本来就已经通过的那些行）是空操作，给它记一条
 * `passed → passed` 只会把真正的变更淹没在噪音里。这也顺带把「只改说明」
 * 那条路径（前端保存 comment 时带着当前结论回传）挡在流水之外。
 */
export function buildRunCaseEventRows(
	input: BuildRunCaseEventRowsInput
): NewTestRunCaseEvent[] {
	const rows: NewTestRunCaseEvent[] = [];
	for (const snapshot of input.snapshots) {
		if (snapshot.result === input.toResult) {
			continue;
		}
		rows.push({
			actorId: input.actorId,
			comment: pickEventComment(input, snapshot),
			fromResult: snapshot.result,
			runCaseId: snapshot.id,
			toResult: input.toResult,
		});
	}
	return rows;
}
