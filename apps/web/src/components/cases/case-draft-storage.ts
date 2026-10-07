import {
	type CaseDraft,
	parseCaseDraft,
} from "@/components/cases/case-draft-parse";

const STORAGE_PREFIX = "automationstack.case-draft.";

function localStore(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function draftKey(projectId: string, caseId: string): string {
	return `${STORAGE_PREFIX}${projectId}.${caseId}`;
}

const draftListeners = new Set<() => void>();

export function subscribeCaseDrafts(listener: () => void): () => void {
	draftListeners.add(listener);
	return () => {
		draftListeners.delete(listener);
	};
}

function notifyCaseDrafts(): void {
	for (const listener of [...draftListeners]) {
		listener();
	}
}

function canonicalize(
	store: Storage,
	projectId: string,
	key: string,
	draft: CaseDraft
): void {
	const canonical = draftKey(projectId, draft.caseId);
	if (canonical === key) {
		return;
	}
	try {
		store.setItem(canonical, JSON.stringify(draft));
		store.removeItem(key);
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
	} catch {}
}

function withModuleId(draft: CaseDraft, keySuffix: string): CaseDraft {
	if (draft.moduleId !== "" || keySuffix === draft.caseId) {
		return draft;
	}
	return { ...draft, moduleId: keySuffix };
}

export function readCaseDraft(
	projectId: string,
	caseId: string
): CaseDraft | null {
	try {
		const direct = parseCaseDraft(
			localStore()?.getItem(draftKey(projectId, caseId)) ?? null
		);
		if (direct !== null && direct.moduleId !== "") {
			return direct;
		}
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
	} catch {}
	return (
		listCaseDrafts(projectId).find((item) => item.caseId === caseId) ?? null
	);
}

export function writeCaseDraft(
	projectId: string,
	draft: Omit<CaseDraft, "savedAt">
): void {
	try {
		localStore()?.setItem(
			draftKey(projectId, draft.caseId),
			JSON.stringify({ ...draft, savedAt: Date.now() })
		);
	} catch {
		return;
	}
	notifyCaseDrafts();
}

export function clearCaseDraft(projectId: string, caseId: string): void {
	try {
		localStore()?.removeItem(draftKey(projectId, caseId));
	} catch {
		return;
	}
	notifyCaseDrafts();
}

export function listCaseDrafts(projectId: string): CaseDraft[] {
	const store = localStore();
	if (store === null) {
		return [];
	}
	const prefix = `${STORAGE_PREFIX}${projectId}.`;
	const found: { draft: CaseDraft; key: string }[] = [];
	try {
		for (let index = 0; index < store.length; index += 1) {
			const key = store.key(index);
			if (key === null || !key.startsWith(prefix)) {
				continue;
			}
			const suffix = key.slice(prefix.length);
			const draft = suffix === "" ? null : parseCaseDraft(store.getItem(key));
			if (draft !== null) {
				found.push({ draft: withModuleId(draft, suffix), key });
			}
		}
	} catch {
		return [];
	}
	for (const item of found) {
		canonicalize(store, projectId, item.key, item.draft);
	}
	return found.map((item) => item.draft).sort((a, b) => b.savedAt - a.savedAt);
}
