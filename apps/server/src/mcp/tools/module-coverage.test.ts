/**
 * 装配这一层出错的方式全是静默的：覆盖数字错位（挂到了别的模块上）、
 * 覆盖查询没返回的模块被整行吃掉、或者缺口标记丢失——三种都照常返回一棵
 * 结构正确的树，只是 agent 会据此判断「这块已经有覆盖了」而少写用例。
 */
import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import type { ModuleCoverageRow } from "@automationstack/db/repositories/project-stats-coverage";
import { describe, expect, it } from "vitest";

import { flattenWithCoverage, renderOutline } from "./module-coverage";

const PAY = "11111111-1111-4111-8111-111111111111";
const REFUND = "22222222-2222-4222-8222-222222222222";
const LOGIN = "33333333-3333-4333-8333-333333333333";

function node(
	id: string,
	name: string,
	parentId: string | null,
	children: ModuleTreeNode[] = []
): ModuleTreeNode {
	return {
		children,
		id,
		name,
		parentId,
		projectId: "44444444-4444-4444-8444-444444444444",
		sortOrder: 0,
	};
}

function coverage(
	moduleId: string,
	caseCount: number,
	activeCaseCount: number,
	gap: ModuleCoverageRow["gap"]
): ModuleCoverageRow {
	return {
		activeCaseCount,
		caseCount,
		directActiveCaseCount: activeCaseCount,
		directCaseCount: caseCount,
		gap,
		moduleId,
		name: moduleId,
		parentId: null,
	};
}

const tree = [
	node(PAY, "支付", null, [node(REFUND, "退款", PAY)]),
	node(LOGIN, "登录", null),
];

describe("flattenWithCoverage", () => {
	it("attaches each module's own counts and keeps depth-first order", () => {
		const flat = flattenWithCoverage(tree, [
			coverage(LOGIN, 4, 0, "no-active"),
			coverage(REFUND, 3, 3, null),
			coverage(PAY, 3, 3, null),
		]);
		expect(flat.map((row) => row.name)).toEqual(["支付", "退款", "登录"]);
		expect(flat.map((row) => row.depth)).toEqual([0, 1, 0]);
		expect(flat[1]).toMatchObject({
			activeCaseCount: 3,
			caseCount: 3,
			gap: null,
		});
		expect(flat[2]).toMatchObject({ caseCount: 4, gap: "no-active" });
	});

	it("keeps a module the coverage query did not return, counted as empty", () => {
		const flat = flattenWithCoverage(tree, []);
		expect(flat).toHaveLength(3);
		for (const row of flat) {
			expect(row).toMatchObject({
				activeCaseCount: 0,
				caseCount: 0,
				gap: "empty",
			});
		}
	});
});

describe("renderOutline", () => {
	it("says so explicitly when the project has no modules", () => {
		expect(renderOutline([])).toBe("(project has no modules yet)");
	});

	it("indents by depth and marks only the modules that have a gap", () => {
		const outline = renderOutline(
			flattenWithCoverage(tree, [
				coverage(PAY, 3, 3, null),
				coverage(REFUND, 3, 3, null),
				coverage(LOGIN, 0, 0, "empty"),
			])
		);
		const lines = outline.split("\n");
		expect(lines[0]).toBe(`- 支付 (id: ${PAY}, 3 cases / 3 active)`);
		expect(lines[1]).toBe(`  - 退款 (id: ${REFUND}, 3 cases / 3 active)`);
		expect(lines[2]).toBe(`- 登录 (id: ${LOGIN}, 0 cases / 0 active) ← 零用例`);
	});
});
