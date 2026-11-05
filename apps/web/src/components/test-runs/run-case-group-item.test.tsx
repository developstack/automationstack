import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunCaseGroupItem } from "@/components/test-runs/run-case-group-item";
import type { RunCaseGroup } from "@/components/test-runs/run-case-groups";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";

function detail(id: string, moduleId: string, name: string): RunCaseDetail {
	return {
		runCase: { assigneeId: null, id, result: "untested" },
		testCase: {
			id: `case-${id}`,
			moduleId,
			moduleName: moduleId,
			name,
			priority: "P2",
		},
	} as unknown as RunCaseDetail;
}

const groups: RunCaseGroup[] = [
	{
		caseCount: 3,
		cases: [detail("r1", "root", "登录成功")],
		children: [
			{
				caseCount: 2,
				cases: [
					detail("c1", "child", "密码错误"),
					detail("c2", "child", "账号锁定"),
				],
				children: [],
				moduleId: "child",
				moduleName: "个人设置",
			},
		],
		moduleId: "root",
		moduleName: "登录",
	},
];

const rows = {
	checkedIds: new Set<string>(),
	collaboratorsByCaseId: new Map(),
	onSelect: vi.fn(),
	onToggleChecked: vi.fn(),
	selectable: false,
	selectedRunCaseId: null,
};

function expansion(open: boolean) {
	return { isOpen: () => open, setOpen: vi.fn() };
}

function renderGroup(state: ReturnType<typeof expansion>) {
	const [group] = groups;
	return render(
		<ul>
			<RunCaseGroupItem
				{...rows}
				depth={0}
				expansion={state}
				group={group as RunCaseGroup}
			/>
		</ul>
	);
}

describe("RunCaseGroupItem：左栏按模块分组显示用例", () => {
	it("shows each module with the case count of its subtree", () => {
		renderGroup(expansion(true));

		expect(
			screen.getByRole("button", { name: "登录 模块，3 条用例" })
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "个人设置 模块，2 条用例" })
		).toBeDefined();
	});

	it("lists the cases of a module and of its child modules", () => {
		renderGroup(expansion(true));

		expect(screen.getByText("登录成功")).toBeDefined();
		expect(screen.getByText("密码错误")).toBeDefined();
		expect(screen.getByText("账号锁定")).toBeDefined();
	});

	it("hides the cases and the child modules of a collapsed module", () => {
		renderGroup(expansion(false));

		expect(screen.queryByText("登录成功")).toBeNull();
		expect(
			screen.queryByRole("button", { name: "个人设置 模块，2 条用例" })
		).toBeNull();
		expect(
			screen.getByRole("button", { name: "登录 模块，3 条用例" })
		).toBeDefined();
	});

	it("reports the new open state when a module is toggled", () => {
		const state = expansion(true);
		renderGroup(state);

		fireEvent.click(
			screen.getByRole("button", { name: "登录 模块，3 条用例" })
		);

		expect(state.setOpen).toHaveBeenCalledWith("root", false);
	});
});
