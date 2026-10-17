import { useQuery } from "@tanstack/react-query";

import {
	isFilteredRunSearch,
	type TestRunsSearch,
	testRunListInput,
} from "@/components/test-runs/test-runs-search";
import { orpc } from "@/utils/orpc";

/**
 * 项目中有没有已作废的测试任务，用来区分「还没有测试任务」和「所有测试任务都已作废」。
 * 只在不筛选、列表为空时查询：用同一个列表接口按「已作废」筛选，与选「已作废」时的查询相同，
 * 之后切换到「已作废」时直接使用缓存。查询返回前为 undefined；其他时候不查询，返回 false。
 */
export function useHasVoidedRuns(
	projectId: string,
	search: TestRunsSearch,
	listEmpty: boolean
): boolean | undefined {
	const needed = listEmpty && !isFilteredRunSearch(search);
	const { data } = useQuery(
		orpc.testRuns.list.queryOptions({
			enabled: needed,
			input: testRunListInput(projectId, { runStatus: "voided" }),
		})
	);
	if (!needed) {
		return false;
	}
	return data === undefined ? undefined : data.length > 0;
}
