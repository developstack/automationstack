import { useCallback, useEffect, useMemo, useState } from "react";
import {
	type DraftSession,
	freshSession,
	openDraftSession,
} from "@/components/cases/case-create-draft-session";
import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import { clearCaseDraft } from "@/components/cases/case-draft-storage";
import {
	type CaseFormValues,
	emptyCaseFormValues,
} from "@/components/cases/case-meta";
import {
	type CaseDraftAttachments,
	useCaseDraftAttachments,
} from "@/components/cases/use-case-draft-attachments";
import { useDraftWrite } from "@/components/cases/use-case-draft-write";

const NO_ATTACHMENTS: readonly CaseDraftAttachment[] = [];

function clearDraftIfAny(projectId: string, caseId: string | null): void {
	if (caseId !== null) {
		clearCaseDraft(projectId, caseId);
	}
}

export interface CaseCreateDraft {
	attachments: CaseDraftAttachments;
	caseId: string | null;
	discard: () => void;
	forget: () => void;
	missing: boolean;
	restoredAt: number | null;
	setValues: (values: CaseFormValues) => void;
	values: CaseFormValues;
}

function sessionFields(
	session: DraftSession | null
): Pick<CaseCreateDraft, "caseId" | "missing" | "restoredAt"> {
	return {
		caseId: session?.caseId ?? null,
		missing: session?.missing ?? false,
		restoredAt: session?.restoredAt ?? null,
	};
}

export function useCaseCreateDraft(
	projectId: string,
	moduleId: string,
	draftId: string | undefined
): CaseCreateDraft {
	const [session, setSession] = useState<DraftSession | null>(null);
	const [values, setValues] = useState<CaseFormValues>(emptyCaseFormValues);
	const [saved, setSaved] = useState(false);
	const baseline = useMemo(() => emptyCaseFormValues(), []);

	useEffect(() => {
		const opened = openDraftSession(projectId, draftId);
		setSession(opened.session);
		if (opened.values !== null) {
			setValues(opened.values);
		}
	}, [draftId, projectId]);

	const currentCaseId = session?.caseId ?? null;

	const attachments = useCaseDraftAttachments({
		caseId: currentCaseId,
		projectId,
		restored: session?.restored ?? NO_ATTACHMENTS,
	});

	useDraftWrite({
		baseline,
		moduleId,
		pending: attachments.pending,
		projectId,
		saved,
		session,
		values,
	});

	const discard = useCallback(() => {
		clearDraftIfAny(projectId, currentCaseId);
		setValues(emptyCaseFormValues());
		setSession(freshSession());
	}, [currentCaseId, projectId]);

	const forget = useCallback(() => {
		setSaved(true);
		clearDraftIfAny(projectId, currentCaseId);
	}, [currentCaseId, projectId]);

	return {
		attachments,
		discard,
		forget,
		setValues,
		values,
		...sessionFields(session),
	};
}
