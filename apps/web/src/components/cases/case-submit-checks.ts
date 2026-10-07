import { extractCaseAttachmentIds } from "@automationstack/api/lib/case-attachment-ref";

import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import type { CaseFormValues } from "@/components/cases/case-meta";
import { hasCaseUploadingRef } from "@/components/cases/case-upload-placeholder";

function caseFormTexts(values: CaseFormValues): string[] {
	const texts = [values.preconditions];
	for (const step of values.steps) {
		texts.push(step.step, step.expected);
	}
	return texts;
}

export function hasUnfinishedCaseUploads(values: CaseFormValues): boolean {
	return caseFormTexts(values).some(hasCaseUploadingRef);
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
	return pending.filter((attachment) => referenced.has(attachment.id));
}
