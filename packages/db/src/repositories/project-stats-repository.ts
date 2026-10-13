import { and, asc, count, eq, inArray, lt, type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import { type CasePriority, testCases } from "../schema/test-cases";
import { daysBefore, STALE_DRAFT_DAYS } from "./project-stats-definitions";

export function countWhere(condition: SQL): SQL<number> {
	return sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
}

export interface ProjectOverviewStats {
	/** 生效用例按优先级的条数（M9）。 */
	activePriorityCounts: Record<CasePriority, number>;
	/** 全部用例状态按优先级的条数。 */
	priorityCounts: Record<CasePriority, number>;
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
	p0Count: number;
	p1Count: number;
	p2Count: number;
	p3Count: number;
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
	p0Count: 0,
	p1Count: 0,
	p2Count: 0,
	p3Count: 0,
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
		priorityCounts: {
			P0: row.p0Count,
			P1: row.p1Count,
			P2: row.p2Count,
			P3: row.p3Count,
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
			p0Count: countWhere(eq(testCases.priority, "P0")),
			p1Count: countWhere(eq(testCases.priority, "P1")),
			p2Count: countWhere(eq(testCases.priority, "P2")),
			p3Count: countWhere(eq(testCases.priority, "P3")),
			staleDraftCount: countWhere(
				sql`${eq(testCases.status, "draft")} and ${lt(testCases.createdAt, staleDraftBefore)}`
			),
			totalCount: count(),
		})
		.from(testCases)
		.where(eq(testCases.projectId, projectId));
	return toOverviewStats(row ?? EMPTY_OVERVIEW_ROW);
}

export const STALE_HIGH_PRIORITY_DAYS = 90;

const STALE_SAMPLE_SIZE = 10;

const MS_PER_DAY = 86_400_000;

const HIGH_PRIORITIES: CasePriority[] = ["P0", "P1"];

export interface StaleCaseRow {
	id: string;
	moduleId: string;
	name: string;
	priority: CasePriority;
	updatedAt: Date;
}

export interface StaleHighPriorityStats {
	items: StaleCaseRow[];
	staleBefore: Date;
	thresholdDays: number;
	total: number;
}

export async function getStaleHighPriorityStats(
	projectId: string
): Promise<StaleHighPriorityStats> {
	const staleBefore = new Date(
		Date.now() - STALE_HIGH_PRIORITY_DAYS * MS_PER_DAY
	);
	const rows = await db
		.select({
			id: testCases.id,
			moduleId: testCases.moduleId,
			name: testCases.name,
			priority: testCases.priority,
			total: sql<number>`count(*) over ()`.mapWith(Number),
			updatedAt: testCases.updatedAt,
		})
		.from(testCases)
		.where(
			and(
				eq(testCases.projectId, projectId),
				inArray(testCases.priority, HIGH_PRIORITIES),
				lt(testCases.updatedAt, staleBefore)
			)
		)
		.orderBy(asc(testCases.updatedAt))
		.limit(STALE_SAMPLE_SIZE);
	return {
		items: rows.map((row) => ({
			id: row.id,
			moduleId: row.moduleId,
			name: row.name,
			priority: row.priority,
			updatedAt: row.updatedAt,
		})),
		staleBefore,
		thresholdDays: STALE_HIGH_PRIORITY_DAYS,
		total: rows[0]?.total ?? 0,
	};
}
