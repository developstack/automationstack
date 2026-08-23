import { type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { db } from "../index";

/**
 * 项目概览的「覆盖缺口」一块：哪些模块一条用例都没有、哪些有用例却没有一条
 * 是 active。从 `project-stats-repository.ts` 拆出来，是因为这块的主体是
 * modules 树、要用递归 CTE，与按 test_cases 直接聚合的那几块形状完全不同
 * （同 `case-import-repository.ts` / `case-import-lookup.ts` 的拆法）。
 */

/** `empty` = 子树内一条用例都没有；`no-active` = 有用例但没有一条是 active。 */
export type ModuleCoverageGap = "empty" | "no-active";

export interface ModuleCoverageRow {
	/** 含子模块的 active 用例数。 */
	activeCaseCount: number;
	/** 含子模块的用例总数。 */
	caseCount: number;
	/** 只算直接挂在本模块下的 active 用例数。 */
	directActiveCaseCount: number;
	/** 只算直接挂在本模块下的用例数。 */
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

/**
 * 查询行 = 模块行 + 三个窗口汇总值。
 *
 * 显式写出索引签名，是因为 `db.execute` 的行泛型约束是
 * `Record<string, unknown>`，而 interface 不会像类型别名那样拿到隐式索引
 * 签名。下面每个具名字段仍然各自带精确类型，取值时不会退化成 unknown。
 */
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

/**
 * 覆盖统计的 CTE 前缀：子树闭包 → 直接计数 → 子树汇总，三段一次写完。
 *
 * 单独拆出来只是为了让下面那条 select 连同函数体留在行数上限内；`param`
 * 由调用方传入（而不是各自 `sql.param(projectId)`），保证整条语句里用的
 * 始终是同一个参数值。SQL 本身逐字未动，只有缩进随嵌套改变。
 */
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

/**
 * 发一次覆盖查询，返回原始行。
 *
 * 与整形逻辑分开：这里是唯一碰 db 的地方，下面的 `toCoverageStats` 只认行
 * 数组，两边各自都好读、好改。
 */
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

/** 查询行 → 对外的模块行：丢掉三个窗口汇总字段，只留模块自身的部分。 */
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

/** 纯整形：查询行数组 → 返回结构，不碰 db，因此可以脱离数据库单独推演。 */
function toCoverageStats(rows: CoverageQueryRow[]): ProjectCoverageStats {
	// 三个汇总值来自窗口函数，每行都一样，取第一行即可；没有模块时全为 0。
	const [first] = rows;
	return {
		emptyModuleCount: first?.emptyModuleCount ?? 0,
		modules: rows.map(toModuleCoverageRow),
		noActiveModuleCount: first?.noActiveModuleCount ?? 0,
		totalModuleCount: first?.totalModuleCount ?? 0,
	};
}

/**
 * 覆盖缺口：每个模块一行，含「直接挂载」与「含子模块」两套计数。
 *
 * 缺口判定口径取 **含子模块（子树）**，理由：modules 是自引用树，中间层模块
 * 在本产品里就是文件夹，用例通常只挂在叶子上。若按「直接挂载」判缺口，
 * 每一个中间层模块都会被标成零用例，卡片会被噪声淹没、失去可操作性。
 * 反过来，只有当一整棵子树都没有用例时，「这块功能没人写用例」才成立。
 *
 * 直接计数仍然一起返回：前端在树上展示每个节点自身的产出时需要它，
 * 而它本就是子树计数的中间结果，顺带取出不增加任何扫描成本。
 *
 * `no-active` 覆盖「有用例但没有一条 active」，包含全是 draft 和全是
 * deprecated 两种情况——两者对当前迭代的有效覆盖是一样的：等于没有。
 *
 * SQL 形状：递归 CTE 先展开「祖先 → 子孙」闭包（行数为各子树规模之和，
 * 约 模块数 × 树深；模块由人工维护，量级在几百以内），再与按 module_id
 * 分组的用例计数左连接求和——用例侧始终是一次分组扫描，不随树形放大。
 * 三个汇总计数用 `count(*) over ()` 在同一条语句里带出，避免为了「有几个
 * 模块有缺口」再扫一遍。
 *
 * 递归项没有再写一次 project_id 过滤：锚点已按项目取模块，而子模块与父模块
 * 恒在同一项目（modules.projectId 非空，移动模块时校验同项目），不会跨项目。
 *
 * 返回全部模块而不只返回有缺口的那些：前端要用 parentId 还原树、并展示
 * 「40 个模块里 12 个有缺口」的分母，而模块数量是人工维护的量级（几百），
 * 全量返回的代价可控。
 */
export async function getProjectCoverageStats(
	projectId: string
): Promise<ProjectCoverageStats> {
	const rows = await queryCoverageRows(projectId);
	return toCoverageStats(rows);
}
