import type { WorkspaceSearch } from "@/components/workspace/workspace-search";

export const CASE_PAGE_SIZE = 20;

export interface CaseListInput {
	includeDescendants: boolean;
	keyword: string | undefined;
	moduleId: string | undefined;
	page: number;
	pageSize: number;
	priority: WorkspaceSearch["priority"];
	projectId: string;
	status: WorkspaceSearch["status"];
	tags: string[] | undefined;
}

export function caseListInput(
	projectId: string,
	search: WorkspaceSearch
): CaseListInput {
	return {
		includeDescendants: true,
		keyword: search.kw === "" ? undefined : search.kw,
		moduleId: search.moduleId,
		page: search.page ?? 1,
		pageSize: CASE_PAGE_SIZE,
		priority:
			search.priority && search.priority.length > 0
				? search.priority
				: undefined,
		projectId,
		status: search.status,
		tags: search.tags && search.tags.length > 0 ? search.tags : undefined,
	};
}

export function casePageCount(total: number): number {
	return Math.max(Math.ceil(total / CASE_PAGE_SIZE), 1);
}
