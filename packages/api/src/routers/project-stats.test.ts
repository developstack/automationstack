import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { callContext, testUser } from "../test-fixtures";
import { projectStatsRouter } from "./project-stats";

const mocks = vi.hoisted(() => ({
	getActiveRuns: vi.fn(),
	getCaseTrend: vi.fn(),
	getExecutionCoverage: vi.fn(),
	getExecutionTrend: vi.fn(),
	getLatestResults: vi.fn(),
	getRunTrend: vi.fn(),
	isProjectMember: vi.fn(),
}));

vi.mock("@automationstack/db/repositories/project-members-repository", () => ({
	isProjectMember: mocks.isProjectMember,
}));
vi.mock("@automationstack/db/repositories/project-stats-coverage", () => ({
	getProjectCoverageStats: vi.fn(),
}));
vi.mock("@automationstack/db/repositories/project-stats-repository", () => ({
	getProjectOverviewStats: vi.fn(),
}));
vi.mock("@automationstack/db/repositories/project-stats-trend", () => ({
	getCaseTrend: mocks.getCaseTrend,
	getExecutionTrend: mocks.getExecutionTrend,
	getRunTrend: mocks.getRunTrend,
}));
vi.mock("@automationstack/db/repositories/project-stats-runs", () => ({
	getActiveRuns: mocks.getActiveRuns,
}));
vi.mock("@automationstack/db/repositories/project-stats-execution", () => ({
	getExecutionCoverage: mocks.getExecutionCoverage,
	getLatestResults: mocks.getLatestResults,
}));

const PROJECT_ID = "55555555-5555-4555-8555-555555555555";

const context = callContext(testUser({ role: "member", username: "alice" }));

const INPUT = { projectId: PROJECT_ID };

function options(name: string) {
	return { context, path: ["projectStats", name] };
}

// 每个查询的返回类型不同，所以每个查询各写一个调用函数，不放进同一个联合类型
const NEW_QUERIES = [
	{
		invoke: () =>
			call(projectStatsRouter.caseTrend, INPUT, options("caseTrend")),
		name: "caseTrend",
		repo: mocks.getCaseTrend,
	},
	{
		invoke: () =>
			call(projectStatsRouter.activeRuns, INPUT, options("activeRuns")),
		name: "activeRuns",
		repo: mocks.getActiveRuns,
	},
	{
		invoke: () =>
			call(
				projectStatsRouter.executionCoverage,
				INPUT,
				options("executionCoverage")
			),
		name: "executionCoverage",
		repo: mocks.getExecutionCoverage,
	},
	{
		invoke: () =>
			call(projectStatsRouter.latestResults, INPUT, options("latestResults")),
		name: "latestResults",
		repo: mocks.getLatestResults,
	},
	{
		invoke: () =>
			call(projectStatsRouter.executionTrend, INPUT, options("executionTrend")),
		name: "executionTrend",
		repo: mocks.getExecutionTrend,
	},
	{
		invoke: () => call(projectStatsRouter.runTrend, INPUT, options("runTrend")),
		name: "runTrend",
		repo: mocks.getRunTrend,
	},
];

beforeEach(() => {
	vi.clearAllMocks();
});

describe("projectStats 的新只读查询", () => {
	it.each(NEW_QUERIES)(
		"$name：项目成员取得该项目的统计",
		async ({ invoke, name, repo }) => {
			mocks.isProjectMember.mockResolvedValue(true);
			repo.mockResolvedValue({ ok: name });

			await expect(invoke()).resolves.toEqual({ ok: name });
			expect(repo).toHaveBeenCalledWith(PROJECT_ID);
		}
	);

	it.each(NEW_QUERIES)(
		"$name：不是项目成员时拒绝，不查询数据",
		async ({ invoke, repo }) => {
			mocks.isProjectMember.mockResolvedValue(false);

			await expect(invoke()).rejects.toMatchObject({
				code: "FORBIDDEN",
			});
			expect(repo).not.toHaveBeenCalled();
		}
	);

	it("删除了 staleHighPriority 和 recentChanges", () => {
		expect(Object.keys(projectStatsRouter).sort()).toEqual([
			"activeRuns",
			"caseTrend",
			"coverage",
			"executionCoverage",
			"executionTrend",
			"latestResults",
			"overview",
			"runTrend",
		]);
	});
});
