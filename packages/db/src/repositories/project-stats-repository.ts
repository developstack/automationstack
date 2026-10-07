import { and, asc, count, eq, inArray, lt, type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import { type CasePriority, testCases } from "../schema/test-cases";

function countWhere(condition: SQL): SQL<number> {
	return sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
}

export interface ProjectOverviewStats {
	priorityCounts: Record<CasePriority, number>;
	statusCounts: { active: number; deprecated: number; draft: number };
	totalCases: number;
}

interface OverviewCountRow {
	activeCount: number;
	deprecatedCount: number;
	draftCount: number;
	p0Count: number;
	p1Count: number;
	p2Count: number;
	p3Count: number;
	totalCount: number;
}

function toPriorityCounts(
	row: OverviewCountRow | undefined
): Record<CasePriority, number> {
	return {
		P0: row?.p0Count ?? 0,
		P1: row?.p1Count ?? 0,
		P2: row?.p2Count ?? 0,
		P3: row?.p3Count ?? 0,
	};
}

function toStatusCounts(
	row: OverviewCountRow | undefined
): ProjectOverviewStats["statusCounts"] {
	return {
		active: row?.activeCount ?? 0,
		deprecated: row?.deprecatedCount ?? 0,
		draft: row?.draftCount ?? 0,
	};
}

export async function getProjectOverviewStats(
	projectId: string
): Promise<ProjectOverviewStats> {
	const [row] = await db
		.select({
			activeCount: countWhere(eq(testCases.status, "active")),
			deprecatedCount: countWhere(eq(testCases.status, "deprecated")),
			draftCount: countWhere(eq(testCases.status, "draft")),
			p0Count: countWhere(eq(testCases.priority, "P0")),
			p1Count: countWhere(eq(testCases.priority, "P1")),
			p2Count: countWhere(eq(testCases.priority, "P2")),
			p3Count: countWhere(eq(testCases.priority, "P3")),
			totalCount: count(),
		})
		.from(testCases)
		.where(eq(testCases.projectId, projectId));
	return {
		priorityCounts: toPriorityCounts(row),
		statusCounts: toStatusCounts(row),
		totalCases: row?.totalCount ?? 0,
	};
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
