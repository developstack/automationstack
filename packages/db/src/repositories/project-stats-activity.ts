import { count, desc, eq } from "drizzle-orm";

import { db } from "../index";
import { aiCaseProposals, aiGenerationSessions } from "../schema/ai";
import { caseVersions, testCases } from "../schema/test-cases";

/**
 * 项目概览里与「人和 AI 做了什么」有关的两块：AI 提案采纳率、最近变更时间线。
 * 从 `project-stats-repository.ts` 拆出来是为了让单文件保持在 300 行以内，
 * 同时这两块的主体表（ai_* / case_versions）与用例统计本就不同。
 */

export interface AiAdoptionStats {
	acceptedCount: number;
	proposalCount: number;
}

/**
 * AI 采纳率的分子与分母。
 *
 * 刻意不返回百分比：分母可能是 0（项目从没用过 AI 生成），此时百分比无定义，
 * 服务端只能编一个 0 交给前端，反而分不清「没用过」与「一条都没被采纳」。
 * 交出 23 / 78 两个数，前端既能显示原始比值，也能自行决定要不要算百分比、
 * 保留几位小数、以及分母为 0 时显示什么。
 *
 * 分子用 `count(accepted_case_id)`——聚合函数只数非空值，这正是「该提案被
 * 采纳」的判据，不需要额外的 filter 子句。
 *
 * 注意该外键是 `on delete set null`：被采纳的用例后来被删掉，这条提案会退回
 * 「未采纳」，于是 status 仍是 accepted、而这里的计数少一条。语义上讲得通
 * ——留存下来的资产才算被采纳——但与 status 口径会有出入，前端不要把两种
 * 口径混在一张卡片里展示。
 *
 * ai_case_proposals 没有 project_id，经 session 关联；inner join 顺带把没有
 * 会话的孤儿行排除掉。
 */
export async function getAiAdoptionStats(
	projectId: string
): Promise<AiAdoptionStats> {
	const [row] = await db
		.select({
			acceptedCount: count(aiCaseProposals.acceptedCaseId),
			proposalCount: count(),
		})
		.from(aiCaseProposals)
		.innerJoin(
			aiGenerationSessions,
			eq(aiCaseProposals.sessionId, aiGenerationSessions.id)
		)
		.where(eq(aiGenerationSessions.projectId, projectId));
	return {
		acceptedCount: row?.acceptedCount ?? 0,
		proposalCount: row?.proposalCount ?? 0,
	};
}

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
