import { eq, ilike, ne, type SQL } from "drizzle-orm";

import { type TestRunStatus, testRuns } from "../schema/test-runs";
import { containsPattern } from "./case-list-filter-core";

export interface ListTestRunsFilter {
	keyword?: string;
	projectId: string;
	status?: TestRunStatus;
}

/** 不选状态筛选时，列表不显示这个状态的测试任务。 */
const HIDDEN_BY_DEFAULT_STATUS: TestRunStatus = "voided";

/** 测试任务列表的筛选条件。不选状态时不包含已作废的测试任务，选了「已作废」才显示。 */
export function buildTestRunListConditions(filter: ListTestRunsFilter): SQL[] {
	const conditions: SQL[] = [
		eq(testRuns.projectId, filter.projectId),
		filter.status
			? eq(testRuns.status, filter.status)
			: ne(testRuns.status, HIDDEN_BY_DEFAULT_STATUS),
	];
	if (filter.keyword) {
		conditions.push(ilike(testRuns.name, containsPattern(filter.keyword)));
	}
	return conditions;
}
