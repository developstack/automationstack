import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { describe, expect, it } from "vitest";

import { buildStepPayload } from "@/components/test-runs/run-step-payload";

const steps: CaseStep[] = ["s1", "s2", "s3"].map((id) => ({
	expected: "",
	id,
	step: id,
}));

describe("buildStepPayload：保存判定时提交的步骤", () => {
	it.each([
		[
			"sends the trimmed actual result of every verdict, in step order",
			{ s1: "passed", s2: "failed", s3: "skipped" },
			{ s1: " 页面正常 ", s2: "支付超时", s3: "  " },
			[
				{ actualResult: "页面正常", result: "passed", stepId: "s1" },
				{ actualResult: "支付超时", result: "failed", stepId: "s2" },
				{ actualResult: null, result: "skipped", stepId: "s3" },
			],
		],
		[
			"sends only verdicts after 一键全部通过",
			{ s1: "passed", s2: "passed", s3: "passed" },
			{},
			[
				{ actualResult: null, result: "passed", stepId: "s1" },
				{ actualResult: null, result: "passed", stepId: "s2" },
				{ actualResult: null, result: "passed", stepId: "s3" },
			],
		],
		[
			"never sends an unjudged step, even when it has an actual result",
			{ s2: "passed" },
			{ s1: "没测到这里", s3: "" },
			[{ actualResult: null, result: "passed", stepId: "s2" }],
		],
	] as const)("%s", (_name, judged, actualResults, expected) => {
		expect(buildStepPayload(steps, judged, actualResults)).toEqual(expected);
	});
});
