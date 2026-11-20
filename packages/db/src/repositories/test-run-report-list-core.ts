import { eq, gte, ilike, isNull, lt, type SQL } from "drizzle-orm";

import { testRuns } from "../schema/test-runs";
import { containsPattern } from "./case-list-filter-core";

export const REPORT_PAGE_SIZE = 20;

/** 提交人筛选中「系统自动提交」的值。系统自动提交的测试任务没有提交人。 */
export const SYSTEM_SUBMITTER = "system";

export interface SubmittedReportFilter {
	keyword?: string;
	/** 只包含在这个时间之前提交的报告（不含这个时间）。 */
	submittedBefore?: Date;
	/** 只包含在这个时间或之后提交的报告。 */
	submittedFrom?: Date;
	/** 提交人的用户 id，或 SYSTEM_SUBMITTER。 */
	submitter?: string;
}

/** 测试报告列表的筛选条件：只包含项目中已提交的测试任务。 */
export function buildSubmittedReportConditions(
	projectId: string,
	filter: SubmittedReportFilter
): SQL[] {
	const conditions: SQL[] = [
		eq(testRuns.projectId, projectId),
		eq(testRuns.status, "submitted"),
	];
	if (filter.keyword) {
		conditions.push(ilike(testRuns.name, containsPattern(filter.keyword)));
	}
	if (filter.submitter === SYSTEM_SUBMITTER) {
		conditions.push(isNull(testRuns.submittedBy));
	} else if (filter.submitter) {
		conditions.push(eq(testRuns.submittedBy, filter.submitter));
	}
	if (filter.submittedFrom) {
		conditions.push(gte(testRuns.submittedAt, filter.submittedFrom));
	}
	if (filter.submittedBefore) {
		conditions.push(lt(testRuns.submittedAt, filter.submittedBefore));
	}
	return conditions;
}
