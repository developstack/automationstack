import {
	and,
	asc,
	count,
	eq,
	ilike,
	inArray,
	type SQL,
	sql,
} from "drizzle-orm";

import { db } from "../index";
import {
	type CasePriority,
	type CaseStatus,
	type TestCase,
	testCases,
} from "../schema/test-cases";
import { containsPattern, prefixPattern } from "./case-list-filter-core";
import { getModuleSubtreeIds } from "./module-subtree";

/**
 * 用例列表页的分页查询与它的筛选条件组装。
 *
 * 与 `case-search-repository.ts` 的分工：那边是「输入关键词即时提示」的轻量
 * 名称搜索（只回摘要字段、按更新时间倒序、不分页），这边是列表页的完整查询
 * （模块 / 状态 / 优先级 / 标签多维筛选 + 分页 + 总数）。两者的排序、返回形状
 * 和调用场景都不同，合并只会让两边都多出一堆用不上的参数。
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface ListTestCasesFilter {
	includeDescendants?: boolean;
	keyword?: string;
	moduleId?: string;
	page?: number;
	pageSize?: number;
	priority?: CasePriority[];
	projectId: string;
	/**
	 * sourceRef 前缀筛选（`like '<prefix>%'`）。
	 *
	 * 为生成场景而加：生成的用例 sourceRef 形如 `gen:<需求标识>#<用例名 slug>`，
	 * 这个参数是「上一轮给这个需求生成了哪些用例」唯一的查询方式，也是重新生成
	 * 前判断该 skip 还是 overwrite 的依据。sourceRef 为 null 的行不会命中
	 * （SQL 里 null 与任何模式比较都是 null，即不匹配），这正是想要的语义。
	 */
	sourceRefPrefix?: string;
	status?: CaseStatus;
	/** 标签筛选，any-of 语义：命中任意一个即匹配；空数组视同不筛选。 */
	tags?: string[];
}

export interface ListTestCasesResult {
	items: TestCase[];
	page: number;
	pageSize: number;
	total: number;
}

async function buildModuleCondition(
	filter: ListTestCasesFilter
): Promise<SQL | undefined> {
	if (!filter.moduleId) {
		return undefined;
	}
	if (filter.includeDescendants) {
		const ids = await getModuleSubtreeIds(db, filter.moduleId);
		return inArray(testCases.moduleId, ids);
	}
	return eq(testCases.moduleId, filter.moduleId);
}

/**
 * 标签筛选条件。
 *
 * 语义定为 **any-of**（命中任意一个标签即匹配），与优先级筛选的多选
 * 语义保持一致：用户勾选多个标签是「扩大」结果集而非「收窄」。
 * 若将来需要 all-of，应新增独立参数而不是改变本参数语义。
 *
 * SQL 用 jsonb 的 `?|`（存在任意一个 key/元素）配合单个 text[] 绑定参数：
 * `tags` 存的是 string[]，`?|` 对 jsonb 数组按元素比较。
 * 注意不能直接把 JS 数组插进 sql 模板（drizzle 会展开成 `($1, $2)`
 * 的列表），必须用 sql.param 打成单个参数再 ::text[]。
 */
function buildTagsCondition(tags: string[]): SQL {
	return sql`${testCases.tags} ?| ${sql.param(tags)}::text[]`;
}

async function buildListConditions(
	filter: ListTestCasesFilter
): Promise<SQL[]> {
	const conditions: SQL[] = [eq(testCases.projectId, filter.projectId)];
	const moduleCondition = await buildModuleCondition(filter);
	if (moduleCondition) {
		conditions.push(moduleCondition);
	}
	if (filter.status) {
		conditions.push(eq(testCases.status, filter.status));
	}
	if (filter.priority && filter.priority.length > 0) {
		conditions.push(inArray(testCases.priority, filter.priority));
	}
	if (filter.tags && filter.tags.length > 0) {
		conditions.push(buildTagsCondition(filter.tags));
	}
	if (filter.keyword) {
		conditions.push(ilike(testCases.name, containsPattern(filter.keyword)));
	}
	if (filter.sourceRefPrefix) {
		conditions.push(
			ilike(testCases.sourceRef, prefixPattern(filter.sourceRefPrefix))
		);
	}
	return conditions;
}

export async function listTestCases(
	filter: ListTestCasesFilter
): Promise<ListTestCasesResult> {
	const conditions = await buildListConditions(filter);
	const where = and(...conditions);
	const page = Math.max(filter.page ?? 1, 1);
	const pageSize = Math.min(
		Math.max(filter.pageSize ?? DEFAULT_PAGE_SIZE, 1),
		MAX_PAGE_SIZE
	);
	const [countRow] = await db
		.select({ value: count() })
		.from(testCases)
		.where(where);
	const items = await db
		.select()
		.from(testCases)
		.where(where)
		.orderBy(asc(testCases.moduleId), asc(testCases.sortOrder))
		.limit(pageSize)
		.offset((page - 1) * pageSize);
	return { items, page, pageSize, total: countRow?.value ?? 0 };
}
