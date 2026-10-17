import { describe, expect, it } from "vitest";

import { planCaseStatusUndo } from "./case-status-undo-core";

const UNDO = {
	idsByPreviousStatus: { active: ["b"], draft: ["a", "c"] },
	status: "deprecated" as const,
};

describe("planCaseStatusUndo：撤销恢复哪些用例，跳过哪些用例", () => {
	it.each<{
		current: { id: string; status: "active" | "deprecated" | "draft" }[];
		name: string;
		restores: { caseId: string; status: string }[];
		skippedIds: string[];
	}>([
		{
			current: [
				{ id: "a", status: "deprecated" },
				{ id: "b", status: "deprecated" },
				{ id: "c", status: "deprecated" },
			],
			name: "都还是这次修改改为的状态：每条恢复为它自己原来的状态",
			restores: [
				{ caseId: "a", status: "draft" },
				{ caseId: "b", status: "active" },
				{ caseId: "c", status: "draft" },
			],
			skippedIds: [],
		},
		{
			current: [
				{ id: "a", status: "active" },
				{ id: "b", status: "deprecated" },
			],
			name: "修改后又被改过的用例和已经不在项目中的用例跳过",
			restores: [{ caseId: "b", status: "active" }],
			skippedIds: ["a", "c"],
		},
	])("$name", ({ current, restores, skippedIds }) => {
		expect(planCaseStatusUndo(current, UNDO)).toEqual({
			restores,
			skippedIds,
		});
	});
});
