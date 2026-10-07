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
	sourceRefPrefix?: string;
	status?: CaseStatus;
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
