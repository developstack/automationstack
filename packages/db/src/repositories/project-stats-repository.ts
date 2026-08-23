import { and, asc, count, eq, inArray, lt, type SQL, sql } from "drizzle-orm";

import { db } from "../index";
import { type CasePriority, testCases } from "../schema/test-cases";

/**
 * 项目概览（dashboard）里以 test_cases 为主体的两块统计：资产总量 / 优先级
 * 分布，以及陈旧的高优用例。
 *
 * 概览的所有查询都遵守同一条铁律：**聚合只在 SQL 里做**
 * （`count(*) filter`、`group by`、窗口函数、递归 CTE）。一个项目可能有上万
 * 条用例，把行捞回 Node 再用数组 reduce，会把内存与序列化成本按行数放大，
 * 而这里真正要的只有十几个标量。
 *
 * 覆盖缺口见 `project-stats-coverage.ts`，AI 采纳率与最近变更见
 * `project-stats-activity.ts`——按主体表拆开，单文件不超过 300 行。
 */

/** 条件计数：`filter` 版本比 `sum(case when ... then 1 end)` 更贴近意图。 */
function countWhere(condition: SQL): SQL<number> {
	return sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
}

export interface ProjectOverviewStats {
	priorityCounts: Record<CasePriority, number>;
	statusCounts: { active: number; deprecated: number; draft: number };
	totalCases: number;
}

/**
 * 概览查询返回的那一行：同一次扫描里用 `filter` 数出来的各口径计数。
 *
 * 单独具名，是为了让下面几个整形函数能接住 `db.select` 的行，并且把
 * 「一行都没有」这种情况显式表达成 `| undefined`（见各整形函数的兜底）。
 */
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

/**
 * 优先级分布整形：把一行计数摊成 P0–P3 的字典。
 *
 * 每个字段各自兜底 0 而不是整行兜底：口径是「查不到就是没有」，任何一个计数
 * 缺失都必须落到 0，不能让 undefined 漏进返回结构里。
 */
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

/**
 * 状态分布整形：draft / active / deprecated 三个口径，兜底口径同优先级。
 *
 * 与优先级分开成两个函数，而不是合并成一个「整行整形」：合并后单个函数的
 * 分支数（每个字段一次 `?.` 加一次 `??`）会再次顶破圈复杂度上限。
 */
function toStatusCounts(
	row: OverviewCountRow | undefined
): ProjectOverviewStats["statusCounts"] {
	return {
		active: row?.activeCount ?? 0,
		deprecated: row?.deprecatedCount ?? 0,
		draft: row?.draftCount ?? 0,
	};
}

/**
 * 资产总量 + 优先级分布。
 *
 * 两块数据来自同一次 test_cases 扫描（`test_cases_project_id_status_idx`
 * 可用），所以合并成一条语句：拆成两个查询等于把同样的扫描做两遍，而它们的
 * 失效时机完全一致——任何一次用例写入都同时改变两者。
 */
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

/**
 * 「陈旧」阈值：90 天。
 *
 * 取一个季度而不是 30 天：用例的维护节奏跟着迭代走，一到六周没人动只说明
 * 这块功能这轮没改，按月卡会把整个用例库都染红、退化成无效告警。跨过一整个
 * 季度都没被任何一次回归修订过的 P0/P1，才是真正需要人去复核的资产。
 */
export const STALE_HIGH_PRIORITY_DAYS = 90;

/** 卡片只列前若干条，其余靠 total 提示；完整列表让用户去 cases.list 里筛。 */
const STALE_SAMPLE_SIZE = 10;

const MS_PER_DAY = 86_400_000;

/** 只盯 P0/P1：低优用例长期不动是常态，混进来会稀释这张卡片的信噪比。 */
const HIGH_PRIORITIES: CasePriority[] = ["P0", "P1"];

export interface StaleCaseRow {
	id: string;
	/** 供前端跳到用例所在模块。 */
	moduleId: string;
	name: string;
	priority: CasePriority;
	updatedAt: Date;
}

export interface StaleHighPriorityStats {
	items: StaleCaseRow[];
	/** 判定时间界：updatedAt 早于它即算陈旧，前端可直接展示。 */
	staleBefore: Date;
	thresholdDays: number;
	total: number;
}

/**
 * 陈旧高优用例：命中总数 + 最久没动的前若干条。
 *
 * 总数用 `count(*) over ()` 与样本行在同一条语句里取回：窗口函数在 LIMIT
 * 之前求值，所以 total 是全量命中数而不是 10。这样既不用发两条查询，也不必
 * 为了拿一个数字把上万行拉回 Node。
 *
 * 时间界在 Node 算好再作为参数传入（而不是 SQL 里 `now() - interval`），
 * 是为了把同一个 staleBefore 原样返回给前端展示，保证「卡片上写的界限」
 * 与「实际筛选用的界限」是同一个值。
 */
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
		// 最久没动的排最前：这张卡片的动作是「从最该复核的那条开始看」。
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
