/**
 * 执行台（详情页）的数据形状与筛选口径。
 *
 * 与 `report-meta.ts` 同一条约定：视图类型从 oRPC 客户端类型反推，
 * 不跨过 api 层去 import repository 里的 interface。
 */
import type { AppRouterClient } from "@automationstack/api/routers/index";
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";

export type TestRunDetailView = Awaited<
	ReturnType<AppRouterClient["testRuns"]["get"]>
>;

/** 清单里的一行：`runCase` 是执行数据，`testCase` 是**实时** join 出来的用例内容。 */
export type RunCaseDetail = TestRunDetailView["cases"][number];

export type TestRunEventItemView = Awaited<
	ReturnType<AppRouterClient["testRuns"]["listEvents"]>
>[number];

/** 人筛选的三档。 */
export type AssigneeFilter = "all" | "mine" | "unassigned";

export interface RunCaseFilter {
	assignee: AssigneeFilter;
	/** undefined = 不按模块筛。 */
	moduleId: string | undefined;
	/** undefined = 不按结论筛；点统计数字就是在设这一项。 */
	result: TestRunCaseResult | undefined;
}

export const DEFAULT_RUN_CASE_FILTER: RunCaseFilter = {
	assignee: "all",
	moduleId: undefined,
	result: undefined,
};

/**
 * 「我的」按 `assigneeId` 判定，不看 `executedBy`。
 *
 * 两者是两件事：指派回答「该谁测」，executedBy 记录「谁打的结论」。
 * 用后者会让「我刚顺手帮别人打了一条」把那条也算进我的待办里，
 * 而这个筛选存在的意义正是「我还剩多少要测」。
 *
 * `currentUserId` 为 null（会话还没到）时「我的」筛出空列表而不是全部：
 * 空列表配上筛选器的选中态是自洽的，全部则会让人以为筛选没生效。
 */
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

/**
 * 清单筛选。三个条件是**与**关系，顺序不影响结果。
 *
 * 保持纯函数（不读 hook、不碰 query）是为了能直接单测：这一层错了，
 * 用户会在「一键通过」时把不该通过的用例一起标掉——那是本页破坏力最大的失误。
 */
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

/**
 * 模块下拉的选项：只列**这个测试任务里真的有用例的**模块。
 *
 * 不去拉项目的完整模块树：测试任务里往往只覆盖三五个模块，把整棵树塞进下拉框，
 * 用户得在几十个空选项里找那几个有内容的。
 */
export function moduleOptionsOf(
	cases: readonly RunCaseDetail[]
): ModuleOption[] {
	const byId = new Map<string, string>();
	for (const item of cases) {
		byId.set(item.testCase.moduleId, item.testCase.moduleName);
	}
	return [...byId].map(([id, name]) => ({ id, name }));
}

/**
 * 打完结论后要跳到的下一条。
 *
 * 「下一条」是**当前筛选后列表里的下一条**，不是全量列表：用户筛了「未测」
 * 就是在做一轮扫尾，跳到一条已经测过的上面等于把他扔出了工作流。
 * 走到末尾返回 null（停在原地），不回卷到开头——回卷会让人以为还有得测，
 * 实际上已经绕了一圈。
 */
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
