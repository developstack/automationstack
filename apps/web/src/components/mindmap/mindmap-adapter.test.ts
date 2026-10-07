import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type { NodeObj } from "mind-elixir";
import { describe, expect, it } from "vitest";

import {
	buildPriorityTag,
	canHaveChildren,
	getContainerNodeRef,
	getEntityNodeRef,
	type MindmapCaseInput,
	type MindmapTreeInput,
	toMindElixirData,
} from "./mindmap-adapter.ts";
import {
	encodeCaseNodeId,
	encodeExpectedNodeId,
	encodeModuleNodeId,
	encodeProjectNodeId,
	encodeStepNodeId,
} from "./mindmap-node-id.ts";

const PROJECT_ID = "project-1";
const MODULE_ID = "module-1";
const CASE_ID = "case-1";

function step(id: string, text: string, expected: string): CaseStep {
	return { expected, id, step: text };
}

function caseInput(steps: CaseStep[]): MindmapCaseInput {
	return {
		id: CASE_ID,
		moduleId: MODULE_ID,
		name: "登录成功",
		priority: "P1",
		sortOrder: 0,
		status: "active",
		steps,
	};
}

function treeOf(steps: CaseStep[]): MindmapTreeInput {
	return {
		cases: [caseInput(steps)],
		modules: [{ children: [], id: MODULE_ID, name: "登录", sortOrder: 0 }],
		projectId: PROJECT_ID,
		projectName: "示例项目",
	};
}

function caseNodeOf(steps: CaseStep[]): NodeObj {
	const root = toMindElixirData(treeOf(steps)).nodeData;
	const node = root.children?.[0]?.children?.[0];
	if (node === undefined) {
		throw new Error("case node missing from the generated tree");
	}
	return node;
}

const twoSteps = [
	step("s1", "打开登录页", "展示登录表单"),
	step("s2", "输入正确的账号密码并提交", "跳转到工作台"),
];

describe("case node step children", () => {
	it("renders one numbered step child per step, in order", () => {
		const node = caseNodeOf(twoSteps);
		expect(node.children?.map((child) => child.topic)).toEqual([
			"1. 打开登录页",
			"2. 输入正确的账号密码并提交",
		]);
		expect(node.children?.map((child) => child.id)).toEqual([
			encodeStepNodeId(CASE_ID, "s1"),
			encodeStepNodeId(CASE_ID, "s2"),
		]);
	});

	it("hangs the expected result under its own step", () => {
		const [first] = caseNodeOf(twoSteps).children ?? [];
		expect(first?.children).toEqual([
			{
				id: encodeExpectedNodeId(CASE_ID, "s1"),
				metadata: { allowChildren: false, kind: "expected" },
				topic: "预期：展示登录表单",
			},
		]);
		expect(first?.expanded).toBe(true);
	});
});

describe("case node collapse and child permissions", () => {
	it("collapses the case node so 54 cases do not open as a wall of text", () => {
		expect(caseNodeOf(twoSteps).expanded).toBe(false);
	});

	it("marks step and expected nodes as unable to take children", () => {
		const [first] = caseNodeOf(twoSteps).children ?? [];
		expect(first?.metadata).toEqual({ allowChildren: false, kind: "step" });
		expect(first?.children?.[0]?.metadata).toEqual({
			allowChildren: false,
			kind: "expected",
		});
	});
});

describe("case node topic and priority tag", () => {
	it("keeps the case tag and topic untouched", () => {
		const node = caseNodeOf(twoSteps);
		expect(node.topic).toBe("登录成功");
		expect(node.tags).toEqual([
			{
				style: {
					background:
						"color-mix(in oklch, var(--destructive) 15%, transparent)",
					color: "var(--destructive)",
				},
				text: "P1",
			},
		]);
	});
});

describe("priority tag emphasis order", () => {
	it("gives P0 the solid destructive fill and P1 the tinted one", () => {
		expect(buildPriorityTag("P0").style).toEqual({
			background: "var(--destructive)",
			color: "var(--destructive-foreground)",
		});
		expect(buildPriorityTag("P1").style).toEqual({
			background: "color-mix(in oklch, var(--destructive) 15%, transparent)",
			color: "var(--destructive)",
		});
	});

	it("never hands a priority tag the primary token", () => {
		for (const priority of ["P0", "P1", "P2", "P3"] as const) {
			expect(JSON.stringify(buildPriorityTag(priority).style)).not.toContain(
				"--primary"
			);
		}
	});
});

describe("degenerate step data", () => {
	it("omits the expected child when expected is empty or blank", () => {
		const node = caseNodeOf([
			step("s1", "只有步骤", ""),
			step("s2", "空白预期", "   "),
		]);
		expect(node.children?.[0]?.children).toBeUndefined();
		expect(node.children?.[0]?.expanded).toBeUndefined();
		expect(node.children?.[1]?.children).toBeUndefined();
	});

	it("leaves a case without steps as a plain leaf", () => {
		const node = caseNodeOf([]);
		expect(node.children).toBeUndefined();
		expect(node.expanded).toBeUndefined();
	});

	it("trims the expected text it renders", () => {
		const node = caseNodeOf([step("s1", "步骤", "  跳转到工作台  ")]);
		expect(node.children?.[0]?.children?.[0]?.topic).toBe("预期：跳转到工作台");
	});
});

describe("module and root nodes keep their existing shape", () => {
	it("leaves modules expanded and able to take children", () => {
		const root = toMindElixirData(treeOf([])).nodeData;
		expect(root.expanded).toBe(true);
		expect(root.id).toBe(encodeProjectNodeId(PROJECT_ID));
		const moduleNode = root.children?.[0];
		expect(moduleNode?.expanded).toBe(true);
		expect(moduleNode?.metadata).toEqual({
			allowChildren: true,
			kind: "module",
		});
	});
});

describe("canHaveChildren", () => {
	it("accepts only modules and the project root", () => {
		expect(canHaveChildren({ id: encodeProjectNodeId(PROJECT_ID) })).toBe(true);
		expect(canHaveChildren({ id: encodeModuleNodeId(MODULE_ID) })).toBe(true);
		expect(canHaveChildren({ id: encodeCaseNodeId(CASE_ID) })).toBe(false);
	});

	it("refuses step and expected nodes", () => {
		expect(canHaveChildren({ id: encodeStepNodeId(CASE_ID, "s1") })).toBe(
			false
		);
		expect(canHaveChildren({ id: encodeExpectedNodeId(CASE_ID, "s1") })).toBe(
			false
		);
	});

	it("refuses ids this scheme does not recognise", () => {
		expect(canHaveChildren({ id: "z:mystery" })).toBe(false);
		expect(canHaveChildren({ id: "" })).toBe(false);
	});
});

describe("entity and container refs", () => {
	it("excludes step and expected nodes from entity refs", () => {
		expect(
			getEntityNodeRef({ id: encodeStepNodeId(CASE_ID, "s1") })
		).toBeNull();
		expect(
			getEntityNodeRef({ id: encodeExpectedNodeId(CASE_ID, "s1") })
		).toBeNull();
		expect(getEntityNodeRef({ id: encodeCaseNodeId(CASE_ID) })).toEqual({
			id: CASE_ID,
			kind: "case",
		});
	});

	it("excludes step and expected nodes from container refs", () => {
		expect(
			getContainerNodeRef({ id: encodeStepNodeId(CASE_ID, "s1") })
		).toBeNull();
		expect(
			getContainerNodeRef({ id: encodeProjectNodeId(PROJECT_ID) })
		).toEqual({ id: PROJECT_ID, kind: "project" });
	});
});
