import { and, asc, count, desc, eq, getTableColumns } from "drizzle-orm";

import { db } from "../index";
import { type TestRun, testRunCases, testRuns } from "../schema/test-runs";
import { users } from "../schema/users";
import { settleAutoSubmitForProject } from "./test-run-auto-submit-repository";
import {
	buildSubmittedReportConditions,
	REPORT_PAGE_SIZE,
	type SubmittedReportFilter,
} from "./test-run-report-list-core";
import {
	runCountColumns,
	type TestRunResultCounts,
} from "./test-runs-repository";

export interface SubmittedReportItem {
	counts: TestRunResultCounts;
	run: TestRun;
	/** 提交人的用户名。系统自动提交时为 null。 */
	submittedByName: string | null;
}

/** 项目中提交过报告的人。id 为 null 表示系统自动提交。 */
export interface ReportSubmitter {
	id: string | null;
	name: string | null;
}

export interface SubmittedReportPage {
	items: SubmittedReportItem[];
	page: number;
	pageSize: number;
	submitters: ReportSubmitter[];
	total: number;
}

/** 项目中所有已提交的报告的提交人，用于提交人筛选。不受其他筛选条件影响。 */
async function listReportSubmitters(
	projectId: string
): Promise<ReportSubmitter[]> {
	return await db
		.selectDistinct({ id: testRuns.submittedBy, name: users.username })
		.from(testRuns)
		.leftJoin(users, eq(users.id, testRuns.submittedBy))
		.where(and(...buildSubmittedReportConditions(projectId, {})))
		.orderBy(asc(users.username));
}

/** 已提交的报告，最近提交的在最前面，每页 REPORT_PAGE_SIZE 条。先结算到期的自动提交。 */
export async function listSubmittedReports(
	projectId: string,
	filter: SubmittedReportFilter & { page?: number } = {}
): Promise<SubmittedReportPage> {
	await settleAutoSubmitForProject(projectId);
	const where = and(...buildSubmittedReportConditions(projectId, filter));
	const page = Math.max(filter.page ?? 1, 1);
	const [countRow] = await db
		.select({ value: count() })
		.from(testRuns)
		.where(where);
	const rows = await db
		.select({
			...getTableColumns(testRuns),
			...runCountColumns(),
			submittedByName: users.username,
		})
		.from(testRuns)
		.leftJoin(testRunCases, eq(testRunCases.runId, testRuns.id))
		.leftJoin(users, eq(users.id, testRuns.submittedBy))
		.where(where)
		.groupBy(testRuns.id, users.id)
		.orderBy(desc(testRuns.submittedAt), desc(testRuns.id))
		.limit(REPORT_PAGE_SIZE)
		.offset((page - 1) * REPORT_PAGE_SIZE);
	const items = rows.map(
		({
			blocked,
			failed,
			passed,
			skipped,
			submittedByName,
			total,
			untested,
			...run
		}) => ({
			counts: { blocked, failed, passed, skipped, total, untested },
			run,
			submittedByName,
		})
	);
	return {
		items,
		page,
		pageSize: REPORT_PAGE_SIZE,
		submitters: await listReportSubmitters(projectId),
		total: countRow?.value ?? 0,
	};
}
