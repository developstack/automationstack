import type { CaseStep } from "../schema/test-cases";

/** 一个步骤最多的实际附件数量。服务端和 web 共用。 */
export const MAX_STEP_ATTACHMENTS = 9;

export type StepAttachmentRejection =
	| { kind: "step-attachment-limit"; max: number }
	| { kind: "unknown-step" };

/** 给一个步骤再加一个实际附件之前的检查：步骤必须属于这个用例，并且还没有达到上限。可以加时返回 null。 */
export function rejectStepAttachment(
	steps: readonly Pick<CaseStep, "id">[],
	stepId: string,
	existing: number
): StepAttachmentRejection | null {
	if (!steps.some((step) => step.id === stepId)) {
		return { kind: "unknown-step" };
	}
	if (existing >= MAX_STEP_ATTACHMENTS) {
		return { kind: "step-attachment-limit", max: MAX_STEP_ATTACHMENTS };
	}
	return null;
}
