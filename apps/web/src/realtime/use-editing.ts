import type { PresenceEntry } from "@automationstack/api/realtime/protocol";
import { useEffect, useMemo } from "react";

import { noopCleanup } from "./noop-cleanup";
import { useRealtime } from "./realtime-context";
import { usePresence } from "./use-presence";

export function useCasePresence(
	caseId: string | null,
	isEditing: boolean
): void {
	const connection = useRealtime()?.connection ?? null;
	useEffect(() => {
		if (!(connection && caseId)) {
			return noopCleanup;
		}
		connection.updatePresence({
			editingCaseId: isEditing ? caseId : null,
			viewingCaseId: caseId,
		});
		return noopCleanup;
	}, [caseId, connection, isEditing]);
	useEffect(() => {
		if (!(connection && caseId)) {
			return noopCleanup;
		}
		return () => {
			connection.updatePresence({ editingCaseId: null, viewingCaseId: null });
		};
	}, [caseId, connection]);
}

export interface CaseCollaborator {
	clientId: string;
	name: string;
}

export interface CaseCollaborators {
	editors: CaseCollaborator[];
	viewers: CaseCollaborator[];
}

function collaboratorOf(entry: PresenceEntry): CaseCollaborator {
	return { clientId: entry.clientId, name: entry.name };
}

function bucketFor(
	byCaseId: Map<string, CaseCollaborators>,
	caseId: string
): CaseCollaborators {
	const existing = byCaseId.get(caseId);
	if (existing) {
		return existing;
	}
	const created: CaseCollaborators = { editors: [], viewers: [] };
	byCaseId.set(caseId, created);
	return created;
}

export function useCollaboratorsByCaseId(): ReadonlyMap<
	string,
	CaseCollaborators
> {
	const entries = usePresence();
	const selfClientId = useRealtime()?.clientId ?? null;
	return useMemo(() => {
		const byCaseId = new Map<string, CaseCollaborators>();
		for (const entry of entries) {
			if (entry.clientId === selfClientId) {
				continue;
			}
			const { editingCaseId, viewingCaseId } = entry;
			if (editingCaseId !== null) {
				bucketFor(byCaseId, editingCaseId).editors.push(collaboratorOf(entry));
			}
			if (viewingCaseId !== null && viewingCaseId !== editingCaseId) {
				bucketFor(byCaseId, viewingCaseId).viewers.push(collaboratorOf(entry));
			}
		}
		return byCaseId;
	}, [entries, selfClientId]);
}

const NO_EDITOR_NAMES: string[] = [];

export function useCaseEditors(caseId: string | undefined): string[] {
	const byCaseId = useCollaboratorsByCaseId();
	const editors =
		caseId === undefined ? undefined : byCaseId.get(caseId)?.editors;
	return useMemo(
		() => editors?.map((editor) => editor.name) ?? NO_EDITOR_NAMES,
		[editors]
	);
}
