import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ModuleNodeLink } from "@/components/workspace/module-node-link";
import {
	hoverTooltipText,
	markTruncated,
	renderRoutes,
} from "@/test-dom-fixtures";

const PROJECT_ID = "p1";
const MODULE_NAME = "登录模块";
const MODULE_ID = "00000000-0000-4000-8000-000000000001";
/** 比 Base UI Tooltip 悬停打开的延迟更长 */
const HOVER_WAIT_MS = 700;

const node: ModuleTreeNode = {
	children: [],
	id: MODULE_ID,
	name: MODULE_NAME,
	parentId: null,
	projectId: PROJECT_ID,
	sortOrder: 0,
};

async function renderLink({ depth = 0, selected = false } = {}) {
	const result = renderRoutes({
		initialPath: `/projects/${PROJECT_ID}?caseId=c1&history=true&kw=abc&page=2`,
		routes: {
			"/projects/$projectId": () => (
				<ModuleNodeLink depth={depth} node={node} selected={selected} />
			),
		},
	});
	const link = await screen.findByRole("link", { name: MODULE_NAME });
	return { ...result, link };
}

/** 打开的 Tooltip 弹层。Base UI 的弹层没有 tooltip 角色，关闭后也可能留在 DOM 中。 */
const tooltipContent = () =>
	document.querySelector<HTMLElement>(
		'[data-slot="tooltip-content"][data-open]'
	);

function wait(ms: number) {
	return act(() => new Promise((resolve) => setTimeout(resolve, ms)));
}

describe("ModuleNodeLink：模块树中的模块名称", () => {
	it.each([
		["悬停", (link: HTMLElement) => fireEvent.pointerEnter(link)],
		["键盘聚焦", (link: HTMLElement) => act(() => link.focus())],
		["点击", (link: HTMLElement) => fireEvent.click(link)],
	])("%s时不显示提示", async (_action, interact) => {
		const { link } = await renderLink();
		fireEvent.pointerMove(link);
		interact(link);
		await wait(HOVER_WAIT_MS);
		expect(tooltipContent()).toBeNull();
		expect(screen.getAllByText(MODULE_NAME)).toHaveLength(1);
	});

	it("层级深、名称被截断：悬停名称时用 Tooltip 显示全名", async () => {
		await renderLink({ depth: 6 });
		const name = screen.getByText(MODULE_NAME);
		markTruncated(name);
		expect(await hoverTooltipText(name)).toBe(MODULE_NAME);
	});

	it("点击后只看这个模块：清除用例选中、新建和页码，保留筛选", async () => {
		const { link, router } = await renderLink();
		fireEvent.click(link);
		await screen.findByRole("link", { name: MODULE_NAME });
		expect(router.state.location.search).toEqual({
			kw: "abc",
			moduleId: MODULE_ID,
		});
	});

	it.each([
		{ ariaCurrent: "true", selected: true, tone: "text-foreground" },
		{ ariaCurrent: null, selected: false, tone: "text-muted-foreground" },
	])(
		"selected=$selected 时 aria-current 是 $ariaCurrent",
		async ({ ariaCurrent, selected, tone }) => {
			const { link } = await renderLink({ selected });
			expect(link.getAttribute("aria-current")).toBe(ariaCurrent);
			expect(link.classList.contains(tone)).toBe(true);
			expect(link.getAttribute("data-module-link")).toBe(MODULE_ID);
		}
	);
});
