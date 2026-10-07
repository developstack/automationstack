import { useCallback, useEffect, useMemo, useState } from "react";

import type { CaseDraft } from "@/components/cases/case-draft-parse";
import {
	clearCaseDraft,
	listCaseDrafts,
	subscribeCaseDrafts,
} from "@/components/cases/case-draft-storage";

const NO_DRAFTS: readonly CaseDraft[] = [];

export interface LocalCaseDrafts {
	items: readonly CaseDraft[];
	refresh: () => void;
	remove: (caseId: string) => void;
}

export function useLocalCaseDrafts(projectId: string): LocalCaseDrafts {
	const [items, setItems] = useState<readonly CaseDraft[]>(NO_DRAFTS);

	const refresh = useCallback(() => {
		setItems(listCaseDrafts(projectId));
	}, [projectId]);

	useEffect(() => {
		const unsubscribe = subscribeCaseDrafts(refresh);
		window.addEventListener("storage", refresh);
		refresh();
		return () => {
			unsubscribe();
			window.removeEventListener("storage", refresh);
		};
	}, [refresh]);

	const remove = useCallback(
		(caseId: string) => clearCaseDraft(projectId, caseId),
		[projectId]
	);

	return useMemo(() => ({ items, refresh, remove }), [items, refresh, remove]);
}
