import type { UseNavigateResult } from "@tanstack/react-router";
import { useCallback } from "react";

import type { ReportsSearch } from "@/components/reports/reports-search";

type ReportListNavigate = UseNavigateResult<"/projects/$projectId/reports/">;

type FilterKey = "from" | "submitter" | "to";

function useFilterSetter(navigate: ReportListNavigate, key: FilterKey) {
	return useCallback(
		(value: string | undefined) => {
			navigate({
				search: (prev: ReportsSearch) => ({
					...prev,
					[key]: value,
					page: undefined,
				}),
			});
		},
		[key, navigate]
	);
}

/** 修改筛选条件时回到第一页。关键词在输入时更新，所以替换历史记录。 */
export function useReportListFilters(navigate: ReportListNavigate) {
	const setKeyword = useCallback(
		(keyword: string) => {
			const kw = keyword === "" ? undefined : keyword;
			navigate({
				replace: true,
				search: (prev: ReportsSearch) =>
					prev.kw === kw ? prev : { ...prev, kw, page: undefined },
			});
		},
		[navigate]
	);
	const setPage = useCallback(
		(page: number) => {
			navigate({
				search: (prev: ReportsSearch) => ({
					...prev,
					page: page === 1 ? undefined : page,
				}),
			});
		},
		[navigate]
	);
	const setFrom = useFilterSetter(navigate, "from");
	const setSubmitter = useFilterSetter(navigate, "submitter");
	const setTo = useFilterSetter(navigate, "to");

	return { setFrom, setKeyword, setPage, setSubmitter, setTo };
}
