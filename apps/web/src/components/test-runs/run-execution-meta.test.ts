import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { describe, expect, it } from "vitest";

import {
	filterRunCases,
	moduleOptionsOf,
	nextRunCaseId,
	type RunCaseDetail,
} from "@/components/test-runs/run-execution-meta";

interface RowSpec {
	assigneeId?: string | null;
	id: string;
	moduleId?: string;
	moduleName?: string;
	result?: TestRunCaseResult;
}

/**
 * 只造筛选真正会读的字段。`as unknown as` 是刻意的：把 TestRunCaseDetail 的
 * 十几个字段全填一遍并不会让这几条断言更可信，只会让每次后端加字段都要改测试。
 */
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

describe("filterRunCases", () => {
	it("三个条件是与关系", () => {
		expect(
			idsOf(
				filterRunCases(
					ALL,
					{ assignee: "mine", moduleId: "m1", result: "passed" },
					"u1"
				)
			)
		).toEqual(["d"]);
	});

	it("「我的」按指派人判定", () => {
		expect(
			idsOf(
				filterRunCases(
					ALL,
					{ assignee: "mine", moduleId: undefined, result: undefined },
					"u1"
				)
			)
		).toEqual(["a", "d"]);
	});

	it("会话未就绪时「我的」是空列表，不是全部", () => {
		// 退化成「全部」会让人以为筛选没生效，然后对着别人的用例按「一键通过」。
		expect(
			filterRunCases(
				ALL,
				{ assignee: "mine", moduleId: undefined, result: undefined },
				null
			)
		).toEqual([]);
	});

	it("「未指派」只看 assigneeId 为空的行", () => {
		expect(
			idsOf(
				filterRunCases(
					ALL,
					{ assignee: "unassigned", moduleId: undefined, result: undefined },
					"u1"
				)
			)
		).toEqual(["b"]);
	});

	it("默认筛选原样返回全部", () => {
		expect(
			idsOf(
				filterRunCases(
					ALL,
					{ assignee: "all", moduleId: undefined, result: undefined },
					"u1"
				)
			)
		).toEqual(["a", "b", "c", "d"]);
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
	it("给出筛选后列表里的下一条", () => {
		expect(nextRunCaseId(ALL, "b")).toBe("c");
	});

	it("末尾停在原地，不回卷到开头", () => {
		// 回卷会让人以为还有得测，实际上已经绕了一圈。
		expect(nextRunCaseId(ALL, "d")).toBeNull();
	});

	it("当前条被筛掉时不乱跳", () => {
		expect(nextRunCaseId(ALL, "不存在")).toBeNull();
	});
});
