import type { WorkspaceSearch } from "@/components/workspace/workspace-search";

export const CASE_PAGE_SIZE = 20;

/** 用例列表的筛选条件，不含分页。列表查询和「选择全部符合筛选的用例」的批量操作使用同一个筛选。 */
export interface CaseListFilter {
	includeDescendants: boolean;
	keyword: string | undefined;
	moduleId: string | undefined;
	priority: WorkspaceSearch["priority"];
	projectId: string;
	status: WorkspaceSearch["status"];
	tags: string[] | undefined;
}

export interface CaseListInput extends CaseListFilter {
	page: number;
	pageSize: number;
}

export function caseListFilter(
	projectId: string,
	search: WorkspaceSearch
): CaseListFilter {
	return {
		includeDescendants: true,
		keyword: search.kw === "" ? undefined : search.kw,
		moduleId: search.moduleId,
		priority:
			search.priority && search.priority.length > 0
				? search.priority
				: undefined,
		projectId,
		status: search.status,
		tags: search.tags && search.tags.length > 0 ? search.tags : undefined,
	};
}

export function caseListInput(
	projectId: string,
	search: WorkspaceSearch
): CaseListInput {
	return {
		...caseListFilter(projectId, search),
		page: search.page ?? 1,
		pageSize: CASE_PAGE_SIZE,
	};
}

export function casePageCount(total: number): number {
	return Math.max(Math.ceil(total / CASE_PAGE_SIZE), 1);
}

export interface CaseRange {
	first: number;
	last: number;
}

/** 当前页的第一条和最后一条用例是第几条。没有用例时都是 0。 */
export function caseRange(page: number, total: number): CaseRange {
	if (total === 0) {
		return { first: 0, last: 0 };
	}
	const first = (page - 1) * CASE_PAGE_SIZE + 1;
	return { first, last: Math.min(page * CASE_PAGE_SIZE, total) };
}
