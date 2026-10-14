import type { TestCase } from "@automationstack/db/schema/test-cases";
import { act, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { CaseTable } from "@/components/cases/case-table";
import { renderRoutes } from "@/test-dom-fixtures";

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const UPDATED_AT = new Date("2026-10-01T08:00:00Z");

function makeCase(id: string, name: string): TestCase {
	return {
		caseType: "functional",
		createdAt: UPDATED_AT,
		currentVersion: 1,
		id,
		lastModifiedBy: null,
		maintainer: null,
		moduleId: "00000000-0000-4000-8000-000000000002",
		name,
		preconditions: null,
		priority: "P1",
		projectId: PROJECT_ID,
		sortOrder: 0,
		sourceRef: null,
		status: "active",
		steps: [],
		tags: [],
		updatedAt: UPDATED_AT,
	};
}

const LOGIN = makeCase("case-login", "登录成功");
const LOGOUT = makeCase("case-logout", "退出登录");
const RESET = makeCase("case-reset", "重置密码");

interface HarnessControls {
	setCases: (cases: TestCase[]) => void;
	setStale: (stale: boolean) => void;
}

async function renderTable(
	initial: TestCase[],
	animateFirst = false
): Promise<HarnessControls> {
	const controls: Partial<HarnessControls> = {};
	function Harness() {
		const [cases, setCases] = useState(initial);
		const [stale, setStale] = useState(false);
		controls.setCases = setCases;
		controls.setStale = setStale;
		return (
			<CaseTable
				animateFirst={animateFirst}
				cases={cases}
				selectedCaseId={undefined}
				stale={stale}
			/>
		);
	}
	renderRoutes({
		initialPath: `/projects/${PROJECT_ID}`,
		routes: { "/projects/$projectId": Harness },
	});
	await screen.findByRole("table");
	return controls as HarnessControls;
}

const rowOf = (name: string) => screen.getByText(name).closest("tr");

describe("CaseTable：改筛选条件和翻页时，表格保留在原位", () => {
	it.each([
		["第一次显示时，行不单独淡入", false, undefined],
		["从空状态或骨架屏换成表格时，每一行都淡入", true, "true"],
	])("%s", async (_name, animateFirst, entering) => {
		await renderTable([LOGIN, LOGOUT], animateFirst);
		expect(rowOf("登录成功")?.dataset.entering).toBe(entering);
		expect(rowOf("退出登录")?.dataset.entering).toBe(entering);
	});

	it("加载新结果时，表格和原来的行留在原位，并标记为忙碌", async () => {
		const controls = await renderTable([LOGIN, LOGOUT]);
		const table = screen.getByRole("table");
		act(() => controls.setStale(true));
		expect(screen.getByRole("table")).toBe(table);
		expect(table.getAttribute("aria-busy")).toBe("true");
		expect(rowOf("登录成功")).not.toBeNull();
	});

	it("新结果到达后，只有新出现的行淡入，留下的行不变", async () => {
		const controls = await renderTable([LOGIN, LOGOUT]);
		const keptRow = rowOf("退出登录");
		act(() => controls.setCases([LOGOUT, RESET]));
		expect(rowOf("退出登录")).toBe(keptRow);
		expect(keptRow?.dataset.entering).toBeUndefined();
		expect(rowOf("重置密码")?.dataset.entering).toBe("true");
		expect(screen.queryByText("登录成功")).toBeNull();
		expect(screen.getByRole("table").getAttribute("aria-busy")).toBe("false");
	});
});
