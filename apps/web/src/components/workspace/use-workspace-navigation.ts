import type {
	CasePriority,
	CaseStatus,
} from "@automationstack/db/schema/test-cases";
import { getRouteApi } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import type {
	WorkspaceSearch,
	WorkspaceSearchReducer,
} from "@/components/workspace/workspace-search";

const routeApi = getRouteApi("/projects/$projectId/");

type SearchPatch = Partial<WorkspaceSearch>;

export interface WorkspaceNavigation {
	clearFilters: () => void;
	closeCase: () => void;
	closeCreate: () => void;
	openCreate: () => void;
	selectCase: (caseId: string) => void;
	setHistory: (open: boolean) => void;
	setKeyword: (keyword: string) => void;
	setPage: (page: number) => void;
	setPriority: (priority: CasePriority[]) => void;
	setStatus: (status: CaseStatus | undefined) => void;
	setTags: (tags: string[]) => void;
}

const FIRST_PAGE: SearchPatch = { page: undefined };

type ApplyPatch = (next: SearchPatch, replace: boolean) => void;
type ApplyReducer = (reducer: WorkspaceSearchReducer, replace: boolean) => void;

function filterActions(patch: ApplyPatch, reduce: ApplyReducer) {
	return {
		clearFilters: () =>
			patch(
				{
					...FIRST_PAGE,
					kw: undefined,
					priority: undefined,
					status: undefined,
					tags: undefined,
				},
				true
			),
		setKeyword: (keyword: string) => {
			const kw = keyword === "" ? undefined : keyword;
			reduce(
				(prev) => (prev.kw === kw ? prev : { ...prev, ...FIRST_PAGE, kw }),
				true
			);
		},
		setPriority: (priority: CasePriority[]) =>
			patch(
				{
					...FIRST_PAGE,
					priority: priority.length === 0 ? undefined : priority,
				},
				true
			),
		setStatus: (status: CaseStatus | undefined) =>
			patch({ ...FIRST_PAGE, status }, true),
		setTags: (tags: string[]) =>
			patch(
				{ ...FIRST_PAGE, tags: tags.length === 0 ? undefined : tags },
				true
			),
	};
}

function selectionActions(patch: ApplyPatch) {
	return {
		closeCase: () => patch({ caseId: undefined, history: undefined }, false),
		closeCreate: () => patch({ create: undefined, draft: undefined }, false),
		openCreate: () => patch({ create: true, draft: undefined }, false),
		selectCase: (caseId: string) =>
			patch(
				{ caseId, create: undefined, draft: undefined, history: undefined },
				false
			),
		setHistory: (open: boolean) => patch({ history: open || undefined }, false),
		setPage: (page: number) =>
			patch({ page: page <= 1 ? undefined : page }, false),
	};
}

export function useWorkspaceNavigation(): WorkspaceNavigation {
	const navigate = routeApi.useNavigate();

	const reduce = useCallback<ApplyReducer>(
		(reducer, replace) => {
			navigate({ replace, search: reducer });
		},
		[navigate]
	);

	const patch = useCallback<ApplyPatch>(
		(next, replace) => {
			reduce((prev) => ({ ...prev, ...next }), replace);
		},
		[reduce]
	);

	return useMemo(
		() => ({ ...filterActions(patch, reduce), ...selectionActions(patch) }),
		[patch, reduce]
	);
}
