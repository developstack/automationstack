import type {
	CasePriority,
	CaseStatus,
	TestCase,
} from "@automationstack/db/schema/test-cases";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { caseListInput } from "@/components/cases/case-list-query";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";
import { orpc } from "@/utils/orpc";

export interface PickerFilters {
	kw: string;
	moduleId: string | undefined;
	page: number;
	priority: CasePriority[];
	status: CaseStatus | undefined;
	tags: string[];
}

const INITIAL_FILTERS: PickerFilters = {
	kw: "",
	moduleId: undefined,
	page: 1,
	priority: [],
	status: undefined,
	tags: [],
};

export interface PickerFilterState {
	filters: PickerFilters;
	setKeyword: (kw: string) => void;
	setModuleId: (moduleId: string | undefined) => void;
	setPage: (page: number) => void;
	setPriority: (priority: CasePriority[]) => void;
	setStatus: (status: CaseStatus | undefined) => void;
	setTags: (tags: string[]) => void;
}

export function usePickerFilters(): PickerFilterState {
	const [filters, setFilters] = useState<PickerFilters>(INITIAL_FILTERS);

	const setModuleId = useCallback((moduleId: string | undefined) => {
		setFilters((prev) => ({ ...prev, moduleId, page: 1 }));
	}, []);
	const setKeyword = useCallback((kw: string) => {
		setFilters((prev) => (prev.kw === kw ? prev : { ...prev, kw, page: 1 }));
	}, []);
	const setStatus = useCallback((status: CaseStatus | undefined) => {
		setFilters((prev) => ({ ...prev, page: 1, status }));
	}, []);
	const setPriority = useCallback((priority: CasePriority[]) => {
		setFilters((prev) => ({ ...prev, page: 1, priority }));
	}, []);
	const setTags = useCallback((tags: string[]) => {
		setFilters((prev) => ({ ...prev, page: 1, tags }));
	}, []);
	const setPage = useCallback((page: number) => {
		setFilters((prev) => ({ ...prev, page }));
	}, []);

	return {
		filters,
		setKeyword,
		setModuleId,
		setPage,
		setPriority,
		setStatus,
		setTags,
	};
}

export function useCasePickerCases(projectId: string, filters: PickerFilters) {
	const search: WorkspaceSearch = useMemo(
		() => ({
			kw: filters.kw,
			moduleId: filters.moduleId,
			page: filters.page,
			priority: filters.priority,
			status: filters.status,
			tags: filters.tags,
		}),
		[filters]
	);

	return useQuery(
		orpc.cases.list.queryOptions({
			input: caseListInput(projectId, search),
			placeholderData: keepPreviousData,
		})
	);
}

interface CasePickerSelectionInput {
	items: TestCase[];
	onChange: (ids: string[]) => void;
	selectedIds: string[];
	selectedSet: ReadonlySet<string>;
}

export interface CasePickerSelection {
	clearSelection: () => void;
	pageAllSelected: boolean;
	toggleOne: (caseId: string) => void;
	togglePage: () => void;
}

export function useCasePickerSelection({
	items,
	onChange,
	selectedIds,
	selectedSet,
}: CasePickerSelectionInput): CasePickerSelection {
	const toggleOne = useCallback(
		(caseId: string) => {
			const next = new Set(selectedIds);
			if (next.has(caseId)) {
				next.delete(caseId);
			} else {
				next.add(caseId);
			}
			onChange([...next]);
		},
		[onChange, selectedIds]
	);

	const pageAllSelected =
		items.length > 0 && items.every((item) => selectedSet.has(item.id));

	const togglePage = useCallback(() => {
		const next = new Set(selectedIds);
		const allSelected =
			items.length > 0 && items.every((item) => next.has(item.id));
		for (const item of items) {
			if (allSelected) {
				next.delete(item.id);
			} else {
				next.add(item.id);
			}
		}
		onChange([...next]);
	}, [items, onChange, selectedIds]);

	const clearSelection = useCallback(() => {
		if (selectedIds.length === 0) {
			return;
		}
		onChange([]);
	}, [onChange, selectedIds.length]);

	return { clearSelection, pageAllSelected, toggleOne, togglePage };
}
