import type { MediaItem } from "@/components/media/media-item";
import type { ReportFailedCase } from "@/components/test-runs/report-meta";
import {
	type RunAttachmentView,
	stepAttachmentItems,
} from "@/components/test-runs/run-step-attachment-items";

/** 报告读取的一条失败用例的步骤和附件。 */
export interface ReportCaseSteps {
	attachments: readonly RunAttachmentView[];
	steps: readonly ReportFailedCase["steps"][number][];
}

/** 报告中一个步骤的实际结果：文字和实际附件，至少有一项。 */
export interface ReportStepResult {
	/** 实际结果的文字。没有填写时为 null。 */
	actualResult: string | null;
	id: string;
	items: MediaItem[];
	position: number;
	step: string;
}

const NO_PENDING_UPLOADS = [] as const;

function hasText(value: string | null): value is string {
	return value !== null && value.trim() !== "";
}

/** 有实际结果（文字或实际附件）的步骤，按步骤顺序。没有实际结果的步骤不显示。 */
export function reportStepResults(row: ReportCaseSteps): ReportStepResult[] {
	const results: ReportStepResult[] = [];
	for (const step of row.steps) {
		const items = stepAttachmentItems(
			row.attachments,
			step.id,
			NO_PENDING_UPLOADS
		);
		const actualResult = hasText(step.actualResult) ? step.actualResult : null;
		if (actualResult !== null || items.length > 0) {
			results.push({
				actualResult,
				id: step.id,
				items,
				position: step.position,
				step: step.step,
			});
		}
	}
	return results;
}
