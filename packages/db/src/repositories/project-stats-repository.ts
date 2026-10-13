import { count, eq, lt, type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import { type CasePriority, testCases } from "../schema/test-cases";
import { daysBefore, STALE_DRAFT_DAYS } from "./project-stats-definitions";
import { countWhere } from "./project-stats-sql";

export interface ProjectOverviewStats {
	/** 生效用例按优先级的条数（M9）。 */
	activePriorityCounts: Record<CasePriority, number>;
	/** 创建超过 14 天、仍是草稿的用例条数（M1）。 */
	staleDraftCount: number;
	statusCounts: { active: number; deprecated: number; draft: number };
	totalCases: number;
}

interface OverviewCountRow {
	activeCount: number;
	activeP0Count: number;
	activeP1Count: number;
	activeP2Count: number;
	activeP3Count: number;
	deprecatedCount: number;
	draftCount: number;
	staleDraftCount: number;
	totalCount: number;
}

const EMPTY_OVERVIEW_ROW: OverviewCountRow = {
	activeCount: 0,
	activeP0Count: 0,
	activeP1Count: 0,
	activeP2Count: 0,
	activeP3Count: 0,
	deprecatedCount: 0,
	draftCount: 0,
	staleDraftCount: 0,
	totalCount: 0,
};

function toOverviewStats(row: OverviewCountRow): ProjectOverviewStats {
	return {
		activePriorityCounts: {
			P0: row.activeP0Count,
			P1: row.activeP1Count,
			P2: row.activeP2Count,
			P3: row.activeP3Count,
		},
		staleDraftCount: row.staleDraftCount,
		statusCounts: {
			active: row.activeCount,
			deprecated: row.deprecatedCount,
			draft: row.draftCount,
		},
		totalCases: row.totalCount,
	};
}

function activeWithPriority(priority: CasePriority): SQL<number> {
	return countWhere(
		sql`${eq(testCases.status, "active")} and ${eq(testCases.priority, priority)}`
	);
}

export async function getProjectOverviewStats(
	projectId: string,
	now: Date = new Date()
): Promise<ProjectOverviewStats> {
	const staleDraftBefore = daysBefore(now, STALE_DRAFT_DAYS);
	const [row] = await db
		.select({
			activeCount: countWhere(eq(testCases.status, "active")),
			activeP0Count: activeWithPriority("P0"),
			activeP1Count: activeWithPriority("P1"),
			activeP2Count: activeWithPriority("P2"),
			activeP3Count: activeWithPriority("P3"),
			deprecatedCount: countWhere(eq(testCases.status, "deprecated")),
			draftCount: countWhere(eq(testCases.status, "draft")),
			staleDraftCount: countWhere(
				sql`${eq(testCases.status, "draft")} and ${lt(testCases.createdAt, staleDraftBefore)}`
			),
			totalCount: count(),
		})
		.from(testCases)
		.where(eq(testCases.projectId, projectId));
	return toOverviewStats(row ?? EMPTY_OVERVIEW_ROW);
}
