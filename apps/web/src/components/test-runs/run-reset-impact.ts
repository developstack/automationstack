const COMMENT_LOSS =
	"这条用例的说明会被一起清掉，结论回到未测；那段字在下面的「判定记录」里还留着变更前的快照。";

/** 打回未测不删除实际附件；有实际附件的步骤重新判定后才能保存。 */
const ATTACHMENTS_KEPT =
	"实际附件会保留，有实际附件的步骤要先重新判定才能保存。";

const STEP_RESULTS_LOSS = `这条用例的全部分步判定和实际结果的文字会被清空，回到一步都没判的状态；要恢复只能逐步重新判一遍。${ATTACHMENTS_KEPT}`;

const BOTH_LOSS = `这条用例的全部分步判定和实际结果的文字，以及说明，都会被清空：分步判定回到一步都没判的状态，要恢复只能逐步重新判一遍；说明在下面的「判定记录」里还留着变更前的快照。${ATTACHMENTS_KEPT}`;

export interface ResetImpactInput {
	comment: string | null;
	stepResultCount: number;
}

export function resetWarning(input: ResetImpactInput): string | null {
	const losesComment = (input.comment ?? "").trim() !== "";
	const losesStepResults = input.stepResultCount > 0;
	if (losesComment && losesStepResults) {
		return BOTH_LOSS;
	}
	if (losesStepResults) {
		return STEP_RESULTS_LOSS;
	}
	if (losesComment) {
		return COMMENT_LOSS;
	}
	return null;
}
