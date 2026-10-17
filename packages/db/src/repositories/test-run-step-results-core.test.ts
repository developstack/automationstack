import { describe, expect, it } from "vitest";

import type { CaseStep } from "../schema/test-cases";
import {
	buildCaseComment,
	deriveCaseResult,
	fillStepResults,
	stepsMissingActualResult,
	unjudgedStepsWithActualResult,
	unknownStepIds,
} from "./test-run-step-results-core";

const steps: CaseStep[] = [
	{ expected: "登录页出现", id: "s1", step: "打开首页" },
	{ expected: "跳到收银台", id: "s2", step: "提交订单" },
	{ expected: "订单变已支付", id: "s3", step: "支付" },
];

describe("fillStepResults", () => {
	it("没点过的步骤落成跳过，顺序跟用例的步骤走", () => {
		expect(fillStepResults(steps, { s2: "failed" })).toEqual([
			{ actualResult: null, result: "skipped", stepId: "s1" },
			{ actualResult: null, result: "failed", stepId: "s2" },
			{ actualResult: null, result: "skipped", stepId: "s3" },
		]);
	});

	it("草稿里的顺序不作数：结果一律按用例当前步骤重排", () => {
		const filled = fillStepResults(steps, {
			s1: "passed",
			s2: "passed",
			s3: "passed",
		});
		expect(filled.map((item) => item.stepId)).toEqual(["s1", "s2", "s3"]);
	});

	it("每种判定都保留实际结果的文字，去掉首尾空白，只有空白时当作没写", () => {
		const filled = fillStepResults(
			steps,
			{ s1: "passed", s2: "failed", s3: "skipped" },
			{ s1: "  登录页正常出现 ", s2: "支付超时", s3: "   \n  " }
		);
		expect(filled.map((item) => item.actualResult)).toEqual([
			"登录页正常出现",
			"支付超时",
			null,
		]);
	});
});

describe("stepsMissingActualResult", () => {
	it.each([
		["失败和阻塞没写实际结果", { s1: "failed", s3: "blocked" }, {}, [1, 3]],
		["实际结果只有空白", { s2: "failed" }, { s2: "  " }, [2]],
		[
			"失败和阻塞都写了",
			{ s1: "failed", s2: "blocked" },
			{ s1: "超时", s2: "没环境" },
			[],
		],
		[
			"通过和跳过可以不写（一键全部通过）",
			{ s1: "passed", s2: "passed", s3: "skipped" },
			{},
			[],
		],
	] as const)("%s", (_name, judged, actualResults, expected) => {
		expect(stepsMissingActualResult(steps, judged, actualResults)).toEqual(
			expected
		);
	});
});

describe("unjudgedStepsWithActualResult", () => {
	it.each<{
		actualResults: Record<string, string>;
		attached: string[];
		expected: number[];
		judged: Record<string, "failed" | "passed" | "skipped">;
		name: string;
	}>([
		{
			actualResults: { s1: "没测到这里" },
			attached: [],
			expected: [1],
			judged: { s2: "passed" },
			name: "没有判定的步骤写了文字",
		},
		{
			actualResults: {},
			attached: ["s3"],
			expected: [3],
			judged: {},
			name: "没有判定的步骤有实际附件",
		},
		{
			actualResults: { s1: "  " },
			attached: [],
			expected: [],
			judged: {},
			name: "只有空白的文字不算实际结果",
		},
		{
			actualResults: { s1: "没环境", s2: "超时" },
			attached: ["s1", "s2"],
			expected: [],
			judged: { s1: "skipped", s2: "failed" },
			name: "有判定的步骤可以有文字和实际附件",
		},
	])("$name", ({ actualResults, attached, expected, judged }) => {
		expect(
			unjudgedStepsWithActualResult(
				steps,
				judged,
				actualResults,
				new Set(attached)
			)
		).toEqual(expected);
	});
});

describe("deriveCaseResult", () => {
	const of = (...results: string[]) =>
		results.map((result, index) => ({
			actualResult: null,
			result: result as "blocked" | "failed" | "passed" | "skipped",
			stepId: `s${index}`,
		}));

	it("一步都没有 = 未测", () => {
		expect(deriveCaseResult([])).toBe("untested");
	});

	it("失败优先于阻塞：两者同时存在时是失败", () => {
		expect(deriveCaseResult(of("passed", "blocked", "failed"))).toBe("failed");
	});

	it("阻塞优先于通过", () => {
		expect(deriveCaseResult(of("passed", "blocked", "skipped"))).toBe(
			"blocked"
		);
	});

	it("有通过、没失败没阻塞 = 通过，哪怕其余全跳过", () => {
		expect(deriveCaseResult(of("passed", "skipped", "skipped"))).toBe("passed");
	});

	it("全部跳过 = 跳过，不算通过（否则一条没测的用例会进通过率分子）", () => {
		expect(deriveCaseResult(of("skipped", "skipped"))).toBe("skipped");
	});
});

describe("buildCaseComment", () => {
	it("只收失败和阻塞的步骤，按用例的步骤顺序和序号折成多行", () => {
		const filled = fillStepResults(
			steps,
			{ s1: "blocked", s2: "passed", s3: "failed" },
			{ s1: "沙箱账号没开通", s2: "页面正常", s3: "支付超时" }
		);
		expect(buildCaseComment(steps, filled)).toBe(
			"步骤 1：沙箱账号没开通\n步骤 3：支付超时"
		);
	});

	it.each([
		["只有通过和跳过的步骤写了实际结果", "skipped", "没测"],
		["失败的步骤没有实际结果", "failed", null],
	] as const)("没有可收的步骤时返回 null：%s", (_name, result, text) => {
		const stepResults = [
			{ actualResult: "页面正常", result: "passed" as const, stepId: "s1" },
			{ actualResult: text, result, stepId: "s2" },
		];
		expect(buildCaseComment(steps, stepResults)).toBeNull();
	});

	it("用例改过、指不到人的那条结果不丢，落成「已删除的步骤」", () => {
		const orphan = [
			{
				actualResult: "旧步骤当时失败了",
				result: "failed" as const,
				stepId: "gone",
			},
		];
		expect(buildCaseComment(steps, orphan)).toBe(
			"已删除的步骤：旧步骤当时失败了"
		);
	});
});

describe("unknownStepIds", () => {
	it("认得出草稿里那些用例已经没有的步骤", () => {
		expect(unknownStepIds(steps, { gone: "failed", s1: "passed" })).toEqual([
			"gone",
		]);
	});

	it("全都对得上时是空数组", () => {
		expect(unknownStepIds(steps, { s1: "passed", s3: "failed" })).toEqual([]);
	});
});
