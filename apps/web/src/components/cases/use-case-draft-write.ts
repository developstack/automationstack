import { useCallback, useEffect, useMemo, useRef } from "react";

import type { DraftSession } from "@/components/cases/case-create-draft-session";
import type {
	CaseDraft,
	CaseDraftAttachment,
} from "@/components/cases/case-draft-parse";
import {
	clearCaseDraft,
	writeCaseDraft,
} from "@/components/cases/case-draft-storage";
import { isCaseFormDirty } from "@/components/cases/case-form-dirty";
import type { CaseFormValues } from "@/components/cases/case-meta";
import { stepsWithoutScreenshots } from "@/components/cases/step-screenshot-save";

const DRAFT_WRITE_DEBOUNCE_MS = 500;

type DraftWrite =
	| { draft: Omit<CaseDraft, "savedAt">; kind: "write" }
	| { caseId: string; kind: "clear" }
	| { kind: "idle" };

const IDLE_FINGERPRINT = JSON.stringify({ kind: "idle" });

function useDraftPersist(write: DraftWrite, projectId: string): void {
	const fingerprint = JSON.stringify(write);
	const latest = useRef({ projectId, write });
	latest.current = { projectId, write };

	const flush = useCallback(() => {
		const { projectId: latestProjectId, write: latestWrite } = latest.current;
		if (latestWrite.kind === "write") {
			writeCaseDraft(latestProjectId, latestWrite.draft);
		} else if (latestWrite.kind === "clear") {
			clearCaseDraft(latestProjectId, latestWrite.caseId);
		}
	}, []);

	useEffect(() => {
		const timer =
			fingerprint === IDLE_FINGERPRINT
				? null
				: window.setTimeout(flush, DRAFT_WRITE_DEBOUNCE_MS);
		return () => {
			if (timer !== null) {
				window.clearTimeout(timer);
			}
		};
	}, [fingerprint, flush]);

	useEffect(() => flush, [flush]);
}

export interface DraftWriteInput {
	baseline: CaseFormValues;
	moduleId: string;
	pending: readonly CaseDraftAttachment[];
	projectId: string;
	saved: boolean;
	session: DraftSession | null;
	values: CaseFormValues;
}

function nextWrite(input: Omit<DraftWriteInput, "projectId">): DraftWrite {
	const { baseline, moduleId, pending, saved, session, values } = input;
	if (session === null || saved) {
		return { kind: "idle" };
	}
	if (!isCaseFormDirty(values, baseline) && pending.length === 0) {
		return { caseId: session.caseId, kind: "clear" };
	}
	return {
		draft: {
			attachments: [...pending],
			caseId: session.caseId,
			moduleId,
			values: { ...values, steps: stepsWithoutScreenshots(values.steps) },
		},
		kind: "write",
	};
}

export function useDraftWrite(input: DraftWriteInput): void {
	const { baseline, moduleId, pending, projectId, saved, session, values } =
		input;
	const write = useMemo<DraftWrite>(
		() => nextWrite({ baseline, moduleId, pending, saved, session, values }),
		[baseline, moduleId, pending, saved, session, values]
	);

	useDraftPersist(write, projectId);
}
