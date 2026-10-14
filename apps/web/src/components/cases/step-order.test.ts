import { describe, expect, it } from "vitest";

import { dropStep } from "@/components/cases/step-order";

const STEPS = ["s1", "s2", "s3", "s4"].map((id) => ({
	expected: "",
	id,
	step: id,
}));

function ids(steps: readonly { id: string }[]): string[] {
	return steps.map((step) => step.id);
}

describe("dropStep：拖动一步放到另一步的位置", () => {
	it("向上拖：放到目标的位置，目标和后面的步骤后移", () => {
		expect(ids(dropStep(STEPS, "s3", "s1"))).toEqual(["s3", "s1", "s2", "s4"]);
	});

	it("向下拖：放到目标的位置，中间的步骤前移", () => {
		expect(ids(dropStep(STEPS, "s1", "s3"))).toEqual(["s2", "s3", "s1", "s4"]);
	});

	it("放回原位或放到列表外时顺序不变，返回原数组", () => {
		expect(dropStep(STEPS, "s2", "s2")).toBe(STEPS);
		expect(dropStep(STEPS, "s2", null)).toBe(STEPS);
		expect(dropStep(STEPS, "s2", "不存在")).toBe(STEPS);
	});
});
