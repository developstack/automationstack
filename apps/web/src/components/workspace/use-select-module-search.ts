import { useCallback } from "react";

import {
	clearCaseSelection,
	type WorkspaceSearch,
} from "@/components/workspace/workspace-search";

export function useSelectModuleSearch(moduleId: string) {
	return useCallback(
		(prev: WorkspaceSearch) => ({
			...clearCaseSelection(prev),
			create: undefined,
			moduleId,
			page: undefined,
		}),
		[moduleId]
	);
}
