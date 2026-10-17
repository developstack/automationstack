import type { StepAttachmentRejection } from "@automationstack/db/repositories/test-run-step-attachments-core";

import type { TestRunErrorThrowers } from "./test-run-errors";

export const UNKNOWN_STEP_MESSAGE = "这个步骤不属于该用例，请刷新后重试";

export const CASE_ATTACHMENT_READ_ONLY_MESSAGE =
	"整条用例的附件只读，不能删除；只能删除步骤的实际附件";

export function isStepAttachmentRejection(rejection: {
	kind: string;
}): rejection is StepAttachmentRejection {
	return (
		rejection.kind === "unknown-step" ||
		rejection.kind === "step-attachment-limit"
	);
}

/** 步骤不属于这条用例，或者步骤的实际附件已经达到上限。 */
export function throwStepAttachmentRejection(
	rejection: StepAttachmentRejection,
	errors: TestRunErrorThrowers
): never {
	if (rejection.kind === "unknown-step") {
		throw errors.BAD_REQUEST({ message: UNKNOWN_STEP_MESSAGE });
	}
	throw errors.BAD_REQUEST({
		message: `一个步骤最多 ${rejection.max} 个实际附件，请先删除不需要的`,
	});
}
