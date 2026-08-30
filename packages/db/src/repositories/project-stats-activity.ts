import { desc, eq } from "drizzle-orm";

import { db } from "../index";
import { caseVersions, testCases } from "../schema/test-cases";

/**
 * 项目概览里的变更时间线。
 *
 * 从 `project-stats-repository.ts` 拆出来是为了让单文件保持在 300 行以内，
 * 同时这一块的主体表（case_versions）与用例统计本就不同。
 */

/** 最近变更卡片的条数上限；要看更多走用例详情里的版本历史。 */
const RECENT_CHANGE_LIMIT = 10;

export interface RecentChangeRow {
	caseId: string;
	caseName: string;
	changeNote: string | null;
	createdAt: Date;
	savedBy: string | null;
	version: number;
	versionId: string;
}

/**
 * 最近变更：case_versions 每写一次就是一条时间线记录。
 *
 * 用例标题取自 test_cases 的当前值而不是快照里的 name，因为这条时间线回答的
 * 是「这条用例后来怎么了」，标题要和用户此刻在列表里看到的一致；inner join
 * 顺带完成项目过滤（case_versions 自身没有 project_id）。
 *
 * 排序补一个 id 兜底：同一次批量导入里多条版本的 created_at 可能落在同一
 * 微秒，只按时间排会让刷新时的顺序抖动。
 */
export function getRecentChanges(
	projectId: string
): Promise<RecentChangeRow[]> {
	return db
		.select({
			caseId: caseVersions.caseId,
			caseName: testCases.name,
			changeNote: caseVersions.changeNote,
			createdAt: caseVersions.createdAt,
			savedBy: caseVersions.savedBy,
			version: caseVersions.version,
			versionId: caseVersions.id,
		})
		.from(caseVersions)
		.innerJoin(testCases, eq(caseVersions.caseId, testCases.id))
		.where(eq(testCases.projectId, projectId))
		.orderBy(desc(caseVersions.createdAt), desc(caseVersions.id))
		.limit(RECENT_CHANGE_LIMIT);
}
