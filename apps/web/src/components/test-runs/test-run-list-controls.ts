import type { TestRunStatus } from "@automationstack/db/schema/test-runs";
import type { UseNavigateResult } from "@tanstack/react-router";
import { useCallback } from "react";

type ListNavigate = UseNavigateResult<"/projects/$projectId/test-runs/">;

export function useTestRunListFilters(navigate: ListNavigate) {
	const setStatus = useCallback(
		(status: TestRunStatus | undefined) => {
			navigate({ search: (prev) => ({ ...prev, runStatus: status }) });
		},
		[navigate]
	);

	const setKeyword = useCallback(
		(keyword: string) => {
			const runKeyword = keyword === "" ? undefined : keyword;
			navigate({
				replace: true,
				search: (prev) =>
					prev.runKeyword === runKeyword ? prev : { ...prev, runKeyword },
			});
		},
		[navigate]
	);

	return { setKeyword, setStatus };
}
