import type { AppRouterClient } from "@automationstack/api/routers/index";
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

export type TestRunDetailView = Awaited<
	ReturnType<AppRouterClient["testRuns"]["get"]>
>;

export type RunCaseDetail = TestRunDetailView["cases"][number];

export type TestRunEventItemView = Awaited<
	ReturnType<AppRouterClient["testRuns"]["listEvents"]>
>[number];

export type AssigneeFilter = "all" | "mine" | "unassigned";

export interface RunCaseFilter {
	assignee: AssigneeFilter;
	moduleId: string | undefined;
	result: TestRunCaseResult | undefined;
}

export const DEFAULT_RUN_CASE_FILTER: RunCaseFilter = {
	assignee: "all",
	moduleId: undefined,
	result: undefined,
};

function matchesAssignee(
	runCase: RunCaseDetail,
	filter: AssigneeFilter,
	currentUserId: string | null
): boolean {
	if (filter === "all") {
		return true;
	}
	if (filter === "unassigned") {
		return runCase.runCase.assigneeId === null;
	}
	return currentUserId !== null && runCase.runCase.assigneeId === currentUserId;
}

export function filterRunCases(
	cases: readonly RunCaseDetail[],
	filter: RunCaseFilter,
	currentUserId: string | null
): RunCaseDetail[] {
	return cases.filter((item) => {
		if (
			filter.moduleId !== undefined &&
			item.testCase.moduleId !== filter.moduleId
		) {
			return false;
		}
		if (filter.result !== undefined && item.runCase.result !== filter.result) {
			return false;
		}
		return matchesAssignee(item, filter.assignee, currentUserId);
	});
}

export interface ModuleOption {
	id: string;
	name: string;
}

export function moduleOptionsOf(
	cases: readonly RunCaseDetail[]
): ModuleOption[] {
	const byId = new Map<string, string>();
	for (const item of cases) {
		byId.set(item.testCase.moduleId, item.testCase.moduleName);
	}
	return [...byId].map(([id, name]) => ({ id, name }));
}

const AUTO_ADVANCE_RESULTS: ReadonlySet<TestRunCaseResult> = new Set([
	"passed",
	"skipped",
]);

export function shouldAutoAdvance(result: TestRunCaseResult): boolean {
	return AUTO_ADVANCE_RESULTS.has(result);
}

export function nextRunCaseId(
	cases: readonly RunCaseDetail[],
	currentRunCaseId: string
): string | null {
	const index = cases.findIndex((item) => item.runCase.id === currentRunCaseId);
	if (index === -1) {
		return null;
	}
	return cases[index + 1]?.runCase.id ?? null;
}
