import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import { readCaseDraft } from "@/components/cases/case-draft-storage";
import type { CaseFormValues } from "@/components/cases/case-meta";

export interface DraftSession {
	caseId: string;
	missing: boolean;
	restored: readonly CaseDraftAttachment[];
	restoredAt: number | null;
}

export function freshSession(missing = false): DraftSession {
	return {
		caseId: crypto.randomUUID(),
		missing,
		restored: [],
		restoredAt: null,
	};
}

interface OpenedDraft {
	session: DraftSession;
	values: CaseFormValues | null;
}

export function openDraftSession(
	projectId: string,
	draftId: string | undefined
): OpenedDraft {
	if (draftId === undefined) {
		return { session: freshSession(), values: null };
	}
	const stored = readCaseDraft(projectId, draftId);
	if (stored === null) {
		return { session: freshSession(true), values: null };
	}
	return {
		session: {
			caseId: stored.caseId,
			missing: false,
			restored: stored.attachments,
			restoredAt: stored.savedAt,
		},
		values: stored.values,
	};
}
