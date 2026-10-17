import { extractCaseAttachmentIds } from "@automationstack/api/lib/case-attachment-ref";
import { COLUMN_SCREENSHOT_KEYS } from "@automationstack/db/schema/test-cases";

import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import type { CaseFormValues } from "@/components/cases/case-meta";
import { hasCaseUploadingRef } from "@/components/cases/case-upload-placeholder";

/** 操作截图和预期截图的所有条目：附件 id，或者上传中的占位。 */
function caseFormScreenshots(values: CaseFormValues): string[] {
	return values.steps.flatMap((step) =>
		COLUMN_SCREENSHOT_KEYS.flatMap((key) => step[key] ?? [])
	);
}

function caseFormTexts(values: CaseFormValues): string[] {
	const texts = [values.preconditions];
	for (const step of values.steps) {
		texts.push(step.step, step.expected);
	}
	return texts;
}

export function hasUnfinishedCaseUploads(values: CaseFormValues): boolean {
	return [...caseFormTexts(values), ...caseFormScreenshots(values)].some(
		hasCaseUploadingRef
	);
}

export function referencedCaseAttachments(
	values: CaseFormValues,
	pending: readonly CaseDraftAttachment[]
): CaseDraftAttachment[] {
	const referenced = new Set<string>();
	for (const text of caseFormTexts(values)) {
		for (const id of extractCaseAttachmentIds(text)) {
			referenced.add(id);
		}
	}
	for (const entry of caseFormScreenshots(values)) {
		referenced.add(entry);
	}
	return pending.filter((attachment) => referenced.has(attachment.id));
}
