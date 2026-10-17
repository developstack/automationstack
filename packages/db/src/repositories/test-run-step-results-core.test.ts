import { describe, expect, it } from "vitest";

import type { CaseStep } from "../schema/test-cases";
import {
	buildCaseComment,
	deriveCaseResult,
	fillStepResults,
	stepsMissingActualResult,
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
	it("按步骤序号把实际结果折成多行，只收写了实际结果的那几步", () => {
		const filled = fillStepResults(
			steps,
			{ s1: "passed", s2: "failed", s3: "blocked" },
			{ s1: "登录页正常出现", s3: "沙箱账号没开通" }
		);
		expect(buildCaseComment(steps, filled)).toBe(
			"步骤 1：登录页正常出现\n步骤 3：沙箱账号没开通"
		);
	});

	it("一条实际结果都没有时返回 null，而不是空字符串", () => {
		const filled = fillStepResults(steps, { s1: "passed" });
		expect(buildCaseComment(steps, filled)).toBeNull();
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
