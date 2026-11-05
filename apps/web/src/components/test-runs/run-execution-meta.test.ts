import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { describe, expect, it } from "vitest";

import {
	filterRunCases,
	moduleOptionsOf,
	nextRunCaseId,
	type RunCaseDetail,
	type RunCaseFilter,
	shouldAutoAdvance,
} from "@/components/test-runs/run-execution-meta";

interface RowSpec {
	assigneeId?: string | null;
	id: string;
	moduleId?: string;
	moduleName?: string;
	result?: TestRunCaseResult;
}

function row(spec: RowSpec): RunCaseDetail {
	return {
		runCase: {
			assigneeId: spec.assigneeId ?? null,
			id: spec.id,
			result: spec.result ?? "untested",
		},
		testCase: {
			moduleId: spec.moduleId ?? "m1",
			moduleName: spec.moduleName ?? "登录",
		},
	} as unknown as RunCaseDetail;
}

const ALL: RunCaseDetail[] = [
	row({ assigneeId: "u1", id: "a", result: "untested" }),
	row({
		assigneeId: null,
		id: "b",
		moduleId: "m2",
		moduleName: "支付",
		result: "passed",
	}),
	row({
		assigneeId: "u2",
		id: "c",
		moduleId: "m2",
		moduleName: "支付",
		result: "failed",
	}),
	row({ assigneeId: "u1", id: "d", result: "passed" }),
];

function idsOf(cases: readonly RunCaseDetail[]): string[] {
	return cases.map((item) => item.runCase.id);
}

const ANY_MODULE_OR_RESULT = { moduleId: undefined, result: undefined };

describe("filterRunCases", () => {
	it.each<[string, RunCaseFilter, string | null, string[]]>([
		[
			"三个条件是与关系",
			{ assignee: "mine", moduleId: "m1", result: "passed" },
			"u1",
			["d"],
		],
		[
			"「我的」按指派人判定",
			{ ...ANY_MODULE_OR_RESULT, assignee: "mine" },
			"u1",
			["a", "d"],
		],
		[
			"会话未就绪时「我的」是空列表，不是全部",
			{ ...ANY_MODULE_OR_RESULT, assignee: "mine" },
			null,
			[],
		],
		[
			"「未指派」只看 assigneeId 为空的行",
			{ ...ANY_MODULE_OR_RESULT, assignee: "unassigned" },
			"u1",
			["b"],
		],
		[
			"默认筛选原样返回全部",
			{ ...ANY_MODULE_OR_RESULT, assignee: "all" },
			"u1",
			["a", "b", "c", "d"],
		],
	])("%s", (_name, filter, currentUserId, ids) => {
		expect(idsOf(filterRunCases(ALL, filter, currentUserId))).toEqual(ids);
	});
});

describe("moduleOptionsOf", () => {
	it("只列测试任务里出现过的模块，且不重复", () => {
		expect(moduleOptionsOf(ALL)).toEqual([
			{ id: "m1", name: "登录" },
			{ id: "m2", name: "支付" },
		]);
	});
});

describe("nextRunCaseId", () => {
	it.each([
		["给出筛选后列表里的下一条", "b", "c"],
		["末尾停在原地，不回卷到开头", "d", null],
		["当前条被筛掉时不乱跳", "不存在", null],
	])("%s", (_name, currentId, nextId) => {
		expect(nextRunCaseId(ALL, currentId)).toBe(nextId);
	});
});

describe("shouldAutoAdvance", () => {
	it("通过 / 跳过：打完自动跳下一条", () => {
		expect(shouldAutoAdvance("passed")).toBe(true);
		expect(shouldAutoAdvance("skipped")).toBe(true);
	});

	it("失败 / 阻塞：留在原地填说明（plan 012 D1）", () => {
		expect(shouldAutoAdvance("failed")).toBe(false);
		expect(shouldAutoAdvance("blocked")).toBe(false);
	});
});
