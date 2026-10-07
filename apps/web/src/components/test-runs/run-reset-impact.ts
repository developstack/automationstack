const COMMENT_LOSS =
	"这条用例的说明会被一起清掉，结论回到未测；那段字在下面的「判定记录」里还留着变更前的快照。";

const STEP_RESULTS_LOSS =
	"这条用例的全部分步判定会被清空，回到一步都没判的状态；要恢复只能逐步重新判一遍。";

const BOTH_LOSS =
	"这条用例的全部分步判定与说明都会被清空：分步判定回到一步都没判的状态，要恢复只能逐步重新判一遍；说明在下面的「判定记录」里还留着变更前的快照。";

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
