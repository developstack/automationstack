import { describe, expect, it } from "vitest";

import type { CaseStep, TestCase } from "../schema/test-cases";
import {
	type CaseContentPatch,
	isNoopCasePatch,
	mergeStepScreenshots,
} from "./case-snapshot-core";

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
const SHOT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SHOT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

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

describe("isNoopCasePatch", () => {
	const row = makeCase();

	it.each([
		["treats an empty patch as a no-op", makeCase(), {}],
		[
			"treats a patch echoing every stored value as a no-op",
			row,
			{
				caseType: row.caseType,
				maintainer: row.maintainer,
				name: row.name,
				preconditions: row.preconditions,
				priority: row.priority,
				sourceRef: row.sourceRef,
				status: row.status,
				steps: [...row.steps],
				tags: [...row.tags],
			},
		],
		[
			"ignores fields the patch omits",
			makeCase({ maintainer: null }),
			{ name: row.name },
		],
		[
			"treats a missing screenshot list as an empty one",
			row,
			{ steps: [{ ...STEP_ONE, screenshots: [] }, STEP_TWO] },
		],
	])("%s", (_name, stored, patch) => {
		expect(isNoopCasePatch(stored, patch)).toBe(true);
	});

	it.each<[string, CaseContentPatch]>([
		["a changed scalar", { priority: "P0" }],
		["a scalar cleared to null", { maintainer: null }],
		[
			"edited step text",
			{ steps: [{ ...STEP_ONE, step: "点击「退款」" }, STEP_TWO] },
		],
		["a reordered step list", { steps: [STEP_TWO, STEP_ONE] }],
		["a removed step", { steps: [STEP_ONE] }],
		["an emptied step list", { steps: [] }],
		[
			"an added step screenshot",
			{ steps: [{ ...STEP_ONE, screenshots: [SHOT_A] }, STEP_TWO] },
		],
		["an added tag", { tags: ["退款", "核心链路", "冒烟"] }],
		["reordered tags", { tags: ["核心链路", "退款"] }],
	])("detects %s", (_name, patch) => {
		expect(isNoopCasePatch(row, patch)).toBe(false);
	});
});

describe("mergeStepScreenshots", () => {
	const stored: CaseStep[] = [
		{ ...STEP_ONE, screenshots: [SHOT_A, SHOT_B] },
		STEP_TWO,
	];

	it.each<[string, CaseStep[], CaseStep[]]>([
		[
			"keeps the stored screenshots of a step with the same id",
			[{ ...STEP_ONE, step: "新的操作" }],
			[{ ...STEP_ONE, screenshots: [SHOT_A, SHOT_B], step: "新的操作" }],
		],
		[
			"gives a new step id no screenshots",
			[{ expected: "", id: "s9", step: "新步骤" }],
			[{ expected: "", id: "s9", step: "新步骤" }],
		],
		[
			"uses the screenshots the writer sends, an empty list included",
			[
				{ ...STEP_ONE, screenshots: [SHOT_B] },
				{ ...STEP_TWO, screenshots: [] },
			],
			[
				{ ...STEP_ONE, screenshots: [SHOT_B] },
				{ ...STEP_TWO, screenshots: [] },
			],
		],
	])("%s", (_name, patched, expected) => {
		expect(mergeStepScreenshots(stored, patched)).toEqual(expected);
	});
});
