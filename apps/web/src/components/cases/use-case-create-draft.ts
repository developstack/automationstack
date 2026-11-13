import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/auth/use-session";
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
	/** 没有改动的新用例表单。维护人是当前用户。 */
	baseline: CaseFormValues;
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

/** 新用例表单的值和没有改动时的值。维护人默认是当前用户。 */
function useNewCaseValues() {
	const maintainer = useSession().user?.username ?? "";
	const [values, setValues] = useState<CaseFormValues>(() =>
		emptyCaseFormValues(maintainer)
	);
	const baseline = useMemo(() => emptyCaseFormValues(maintainer), [maintainer]);
	return { baseline, maintainer, setValues, values };
}

export function useCaseCreateDraft(
	projectId: string,
	moduleId: string,
	draftId: string | undefined
): CaseCreateDraft {
	const [session, setSession] = useState<DraftSession | null>(null);
	const { baseline, maintainer, setValues, values } = useNewCaseValues();
	const [saved, setSaved] = useState(false);

	useEffect(() => {
		const opened = openDraftSession(projectId, draftId);
		setSession(opened.session);
		if (opened.values !== null) {
			setValues(opened.values);
		}
	}, [draftId, projectId, setValues]);

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
		setValues(emptyCaseFormValues(maintainer));
		setSession(freshSession());
	}, [currentCaseId, maintainer, projectId, setValues]);

	const forget = useCallback(() => {
		setSaved(true);
		clearDraftIfAny(projectId, currentCaseId);
	}, [currentCaseId, projectId]);

	return {
		attachments,
		baseline,
		discard,
		forget,
		setValues,
		values,
		...sessionFields(session),
	};
}
