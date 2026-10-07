import { describe, expect, it } from "vitest";

import type { CaseStep, TestCase } from "../schema/test-cases";
import { isNoopCasePatch } from "./case-snapshot-core";

const STEP_ONE: CaseStep = {
	expected: "弹出退款原因选择",
	id: "s1",
	step: "点击「申请退款」",
};
const STEP_TWO: CaseStep = {
	expected: "退款单创建成功",
	id: "s2",
	step: "选择原因并提交",
};
const STEPS: CaseStep[] = [STEP_ONE, STEP_TWO];

function makeCase(overrides: Partial<TestCase> = {}): TestCase {
	return {
		caseType: "functional",
		createdAt: new Date("2026-01-01T00:00:00Z"),
		currentVersion: 3,
		id: "11111111-1111-1111-1111-111111111111",
		lastModifiedBy: "张三",
		maintainer: "王五",
		moduleId: "22222222-2222-2222-2222-222222222222",
		name: "未发货订单申请退款",
		preconditions: "存在一笔已支付未发货订单",
		priority: "P1",
		projectId: "33333333-3333-3333-3333-333333333333",
		sortOrder: 0,
		sourceRef: "seed:refund:001",
		status: "active",
		steps: STEPS,
		tags: ["退款", "核心链路"],
		updatedAt: new Date("2026-01-01T00:00:00Z"),
		...overrides,
	};
}

describe("isNoopCasePatch 认定为无变化的 patch", () => {
	it("treats an empty patch as a no-op", () => {
		expect(isNoopCasePatch(makeCase(), {})).toBe(true);
	});

	it("treats a patch echoing every stored value as a no-op", () => {
		const row = makeCase();
		expect(
			isNoopCasePatch(row, {
				caseType: row.caseType,
				maintainer: row.maintainer,
				name: row.name,
				preconditions: row.preconditions,
				priority: row.priority,
				sourceRef: row.sourceRef,
				status: row.status,
				steps: [...row.steps],
				tags: [...row.tags],
			})
		).toBe(true);
	});

	it("ignores fields the patch omits", () => {
		const row = makeCase({ maintainer: null });
		expect(isNoopCasePatch(row, { name: row.name })).toBe(true);
	});
});

describe("isNoopCasePatch 对标量字段的比较", () => {
	it("detects a changed scalar", () => {
		expect(isNoopCasePatch(makeCase(), { priority: "P0" })).toBe(false);
	});

	it("detects a scalar cleared to null", () => {
		expect(isNoopCasePatch(makeCase(), { maintainer: null })).toBe(false);
	});
});

describe("isNoopCasePatch 对 steps 的比较", () => {
	it("detects edited step text", () => {
		expect(
			isNoopCasePatch(makeCase(), {
				steps: [{ ...STEP_ONE, step: "点击「退款」" }, STEP_TWO],
			})
		).toBe(false);
	});

	it("detects a reordered step list", () => {
		expect(isNoopCasePatch(makeCase(), { steps: [STEP_TWO, STEP_ONE] })).toBe(
			false
		);
	});

	it("detects a removed step", () => {
		expect(isNoopCasePatch(makeCase(), { steps: [STEP_ONE] })).toBe(false);
	});

	it("treats an emptied step list as a change", () => {
		expect(isNoopCasePatch(makeCase(), { steps: [] })).toBe(false);
	});
});

describe("isNoopCasePatch 对 tags 的比较", () => {
	it("detects an added tag", () => {
		expect(
			isNoopCasePatch(makeCase(), { tags: ["退款", "核心链路", "冒烟"] })
		).toBe(false);
	});

	it("detects reordered tags", () => {
		expect(isNoopCasePatch(makeCase(), { tags: ["核心链路", "退款"] })).toBe(
			false
		);
	});
});
