import { SYSTEM_SUBMITTER } from "@automationstack/db/repositories/test-run-report-list-core";
import { z } from "zod";

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* 地址中的值不合法时忽略这个筛选条件，不显示错误页。 */
export const reportsSearchSchema = z.object({
	/** 提交日期的开始，本地日期 YYYY-MM-DD，包含这一天。 */
	from: z.string().regex(LOCAL_DATE).optional().catch(undefined),
	kw: z.string().optional(),
	page: z.number().int().min(1).optional().catch(undefined),
	/** 提交人的用户 id，或「系统自动提交」的值 SYSTEM_SUBMITTER。 */
	submitter: z
		.union([z.uuid(), z.literal(SYSTEM_SUBMITTER)])
		.optional()
		.catch(undefined),
	/** 提交日期的结束，本地日期 YYYY-MM-DD，包含这一天。 */
	to: z.string().regex(LOCAL_DATE).optional().catch(undefined),
});

export type ReportsSearch = z.infer<typeof reportsSearchSchema>;

/** 有没有筛选条件。分页不算筛选条件。 */
export function isFilteredReportSearch(search: ReportsSearch): boolean {
	return (
		search.kw !== undefined ||
		search.submitter !== undefined ||
		search.from !== undefined ||
		search.to !== undefined
	);
}

/** 本地时区中这一天的 0 点。 */
function startOfLocalDay(date: string): Date {
	return new Date(`${date}T00:00:00`);
}

/** 本地时区中下一天的 0 点。用于「包含结束这一天」。 */
function startOfNextLocalDay(date: string): Date {
	const next = startOfLocalDay(date);
	next.setDate(next.getDate() + 1);
	return next;
}

export function reportListInput(projectId: string, search: ReportsSearch) {
	return {
		keyword: search.kw,
		page: search.page,
		projectId,
		submittedBefore:
			search.to === undefined ? undefined : startOfNextLocalDay(search.to),
		submittedFrom:
			search.from === undefined ? undefined : startOfLocalDay(search.from),
		submitter: search.submitter,
	};
}
