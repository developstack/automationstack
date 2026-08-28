/**
 * 分步判定的三条纯逻辑。它们错了不会有任何地方报错，只会让用例结论、
 * 报告里的失败原因、Jira 单的描述**静默地**变成另一个意思，所以逐条钉住。
 */
import { describe, expect, it } from "vitest";

import type { CaseStep } from "../schema/test-cases";
import {
	buildCaseComment,
	deriveCaseResult,
	fillStepResults,
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
			{ comment: null, result: "skipped", stepId: "s1" },
			{ comment: null, result: "failed", stepId: "s2" },
			{ comment: null, result: "skipped", stepId: "s3" },
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

	it("只有失败 / 阻塞才留下原因", () => {
		const filled = fillStepResults(
			steps,
			{ s1: "passed", s2: "failed", s3: "blocked" },
			{ s1: "点错了写的", s2: "支付超时", s3: "环境没起来" }
		);
		expect(filled.map((item) => item.comment)).toEqual([
			null,
			"支付超时",
			"环境没起来",
		]);
	});

	it("判成通过时那段原因不落库——但草稿里留着是另一回事", () => {
		const [first] = fillStepResults(
			steps,
			{ s1: "passed" },
			{ s1: "支付超时" }
		);
		expect(first?.comment).toBeNull();
	});

	it("只有空白字符的原因当作没写", () => {
		const [, second] = fillStepResults(
			steps,
			{ s2: "failed" },
			{ s2: "   \n  " }
		);
		expect(second?.comment).toBeNull();
	});
});

describe("deriveCaseResult", () => {
	const of = (...results: string[]) =>
		results.map((result, index) => ({
			comment: null,
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
	it("按步骤序号折成多行，只收有原因的那几步", () => {
		const filled = fillStepResults(
			steps,
			{ s1: "passed", s2: "failed", s3: "blocked" },
			{ s2: "支付超时，订单状态没回滚", s3: "沙箱账号没开通" }
		);
		expect(buildCaseComment(steps, filled)).toBe(
			"步骤 2：支付超时，订单状态没回滚\n步骤 3：沙箱账号没开通"
		);
	});

	it("一条原因都没有时返回 null，而不是空字符串", () => {
		const filled = fillStepResults(steps, { s1: "passed" });
		expect(buildCaseComment(steps, filled)).toBeNull();
	});

	it("用例改过、指不到人的那条结果不丢，落成「已删除的步骤」", () => {
		const orphan = [
			{
				comment: "旧步骤当时失败了",
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
