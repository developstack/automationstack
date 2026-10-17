import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

import {
	getExecutionCoverage,
	getLatestResults,
} from "./project-stats-execution";
import { NOW } from "./project-stats-fixtures";
import { getActiveRuns } from "./project-stats-runs";
import { getExecutionTrend, getRunTrend } from "./project-stats-trend";
import { renderSql } from "./sql-render-fixtures";

const recorded = vi.hoisted(() => ({ wheres: [] as SQL[] }));

// 假的 db：查询链上的每个方法都返回自己，记录 where 的条件，await 时返回空行
vi.mock("../index", () => {
	const chain: object = new Proxy(
		{},
		{
			get: (_target, property) => {
				if (property === "then") {
					return (resolve: (rows: unknown[]) => void) => resolve([]);
				}
				if (property === "where") {
					return (condition: SQL) => {
						recorded.wheres.push(condition);
						return chain;
					};
				}
				return () => chain;
			},
		}
	);
	return { db: chain };
});

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
	recorded.wheres.length = 0;
});

// 每一项读取测试任务的统计，查询都使用排除已作废测试任务的条件（ADR 0004）
it.each<[string, () => Promise<unknown>]>([
	["M3 进行中的测试任务", () => getActiveRuns(PROJECT_ID, NOW)],
	["M4 执行覆盖率", () => getExecutionCoverage(PROJECT_ID, NOW)],
	["M5 最新执行结果", () => getLatestResults(PROJECT_ID, NOW)],
	["M6 每周执行结果", () => getExecutionTrend(PROJECT_ID, NOW)],
	["M7 测试任务新建和完成趋势", () => getRunTrend(PROJECT_ID, NOW)],
])("%s：查询不包含已作废的测试任务", async (_name, read) => {
	await read();

	expect(recorded.wheres.map(renderSql)).toContainEqual({
		params: expect.arrayContaining([PROJECT_ID, "voided"]),
		sql: expect.stringContaining(
			`"test_runs"."project_id" = $1 and "test_runs"."status" <> $2`
		),
	});
});
