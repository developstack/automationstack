import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { db } from "../index";

export type ModuleCoverageGap = "empty" | "no-active";

export interface ModuleCoverageRow {
	activeCaseCount: number;
	caseCount: number;
	directActiveCaseCount: number;
	directCaseCount: number;
	gap: ModuleCoverageGap | null;
	moduleId: string;
	name: string;
	parentId: string | null;
}

export interface ProjectCoverageStats {
	emptyModuleCount: number;
	modules: ModuleCoverageRow[];
	noActiveModuleCount: number;
	totalModuleCount: number;
}

interface CoverageQueryRow {
	activeCaseCount: number;
	caseCount: number;
	directActiveCaseCount: number;
	directCaseCount: number;
	emptyModuleCount: number;
	gap: ModuleCoverageGap | null;
	moduleId: string;
	name: string;
	noActiveModuleCount: number;
	parentId: string | null;
	totalModuleCount: number;
	[column: string]: unknown;
}

function coverageCtes(param: SQLWrapper): SQL {
	return sql`
		with recursive subtree as (
				select id as ancestor_id, id as node_id
				from modules
				where project_id = ${param}
			union all
				select s.ancestor_id, m.id
				from modules m
				inner join subtree s on m.parent_id = s.node_id
		),
		direct_counts as (
			select
				module_id,
				(count(*))::int as case_count,
				(count(*) filter (where status = 'active'))::int as active_count
			from test_cases
			where project_id = ${param}
			group by module_id
		),
		rolled as (
			select
				s.ancestor_id as module_id,
				coalesce(sum(d.case_count), 0)::int as case_count,
				coalesce(sum(d.active_count), 0)::int as active_count
			from subtree s
			left join direct_counts d on d.module_id = s.node_id
			group by s.ancestor_id
		)
	`;
}

async function queryCoverageRows(
	projectId: string
): Promise<CoverageQueryRow[]> {
	const param = sql.param(projectId);
	const result = await db.execute<CoverageQueryRow>(sql`
		${coverageCtes(param)}
		select
			m.id as "moduleId",
			m.name as "name",
			m.parent_id as "parentId",
			coalesce(d.case_count, 0) as "directCaseCount",
			coalesce(d.active_count, 0) as "directActiveCaseCount",
			coalesce(r.case_count, 0) as "caseCount",
			coalesce(r.active_count, 0) as "activeCaseCount",
			case
				when coalesce(r.case_count, 0) = 0 then 'empty'
				when coalesce(r.active_count, 0) = 0 then 'no-active'
				else null
			end as "gap",
			(count(*) filter (where coalesce(r.case_count, 0) = 0) over ())::int
				as "emptyModuleCount",
			(count(*) filter (
				where coalesce(r.case_count, 0) > 0 and coalesce(r.active_count, 0) = 0
			) over ())::int as "noActiveModuleCount",
			(count(*) over ())::int as "totalModuleCount"
		from modules m
		left join rolled r on r.module_id = m.id
		left join direct_counts d on d.module_id = m.id
		where m.project_id = ${param}
		order by m.sort_order asc, m.name asc
	`);
	return result.rows;
}

function toModuleCoverageRow(row: CoverageQueryRow): ModuleCoverageRow {
	return {
		activeCaseCount: row.activeCaseCount,
		caseCount: row.caseCount,
		directActiveCaseCount: row.directActiveCaseCount,
		directCaseCount: row.directCaseCount,
		gap: row.gap,
		moduleId: row.moduleId,
		name: row.name,
		parentId: row.parentId,
	};
}

function toCoverageStats(rows: CoverageQueryRow[]): ProjectCoverageStats {
	const [first] = rows;
	return {
		emptyModuleCount: first?.emptyModuleCount ?? 0,
		modules: rows.map(toModuleCoverageRow),
		noActiveModuleCount: first?.noActiveModuleCount ?? 0,
		totalModuleCount: first?.totalModuleCount ?? 0,
	};
}

export async function getProjectCoverageStats(
	projectId: string
): Promise<ProjectCoverageStats> {
	const rows = await queryCoverageRows(projectId);
	return toCoverageStats(rows);
}
