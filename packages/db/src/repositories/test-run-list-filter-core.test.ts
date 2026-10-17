import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { expect, it } from "vitest";

import {
	buildTestRunListConditions,
	type ListTestRunsFilter,
} from "./test-run-list-filter-core";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const PROJECT = '"test_runs"."project_id" = $1';

function renderWhere(filter: ListTestRunsFilter) {
	const where = and(...buildTestRunListConditions(filter));
	if (!where) {
		throw new Error("列表条件不能为空");
	}
	// sqlToQuery 还返回参数的类型提示（typings），这里只比较 SQL 和参数
	const { params, sql } = new PgDialect().sqlToQuery(where);
	return { params, sql };
}

// 不选状态时排除已作废的测试任务；选了状态（包括已作废）只显示这个状态；关键词也不显示已作废
it.each<[string, Omit<ListTestRunsFilter, "projectId">, string, unknown[]]>([
	[
		"不选状态：不包含已作废",
		{},
		`(${PROJECT} and "test_runs"."status" <> $2)`,
		[PROJECT_ID, "voided"],
	],
	[
		"选「已作废」：只显示已作废",
		{ status: "voided" },
		`(${PROJECT} and "test_runs"."status" = $2)`,
		[PROJECT_ID, "voided"],
	],
	[
		"选其他状态：只显示这个状态",
		{ status: "in_progress" },
		`(${PROJECT} and "test_runs"."status" = $2)`,
		[PROJECT_ID, "in_progress"],
	],
	[
		"关键词：按名称包含匹配",
		{ keyword: "登录" },
		`(${PROJECT} and "test_runs"."status" <> $2 and "test_runs"."name" ilike $3)`,
		[PROJECT_ID, "voided", "%登录%"],
	],
])("%s", (_name, filter, sql, params) => {
	expect(renderWhere({ ...filter, projectId: PROJECT_ID })).toEqual({
		params,
		sql,
	});
});
