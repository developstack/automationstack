import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
	caseSelectionScope,
	useCaseSelection,
} from "@/components/cases/use-case-selection";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";

const PROJECT_ID = "project-1";

function renderSelection(initial: WorkspaceSearch) {
	const view = renderHook(
		({ search }) => useCaseSelection(caseSelectionScope(PROJECT_ID, search)),
		{ initialProps: { search: initial } }
	);
	const selected = () => [...view.result.current.ids].sort();
	return { selected, view };
}

describe("useCaseSelection：勾选的用例跨页保留，切换筛选条件时清空", () => {
	it("勾选一行、勾选当前页、清空", () => {
		const { selected, view } = renderSelection({});
		act(() => view.result.current.toggle("a"));
		act(() => view.result.current.togglePage(["a", "b"]));
		expect(selected()).toEqual(["a", "b"]);
		act(() => view.result.current.togglePage(["a", "b"]));
		expect(selected()).toEqual([]);
		act(() => view.result.current.toggle("c"));
		act(() => view.result.current.clear());
		expect(selected()).toEqual([]);
	});

	it.each<[string, WorkspaceSearch, string[]]>([
		["翻页：保留", { page: 2 }, ["a"]],
		["打开用例详情：保留", { caseId: "a" }, ["a"]],
		["关键字为空和没有关键字相同：保留", { kw: "" }, ["a"]],
		["改关键字：清空", { kw: "登录" }, []],
		["改状态：清空", { status: "draft" }, []],
		["改优先级：清空", { priority: ["P0"] }, []],
		["改标签：清空", { tags: ["冒烟"] }, []],
		["换模块：清空", { moduleId: "module-2" }, []],
	])("%s", (_name, next, expected) => {
		const { selected, view } = renderSelection({});
		act(() => view.result.current.toggle("a"));
		view.rerender({ search: next });
		expect(selected()).toEqual(expected);
	});

	it("切回原来的筛选条件时，不恢复以前的勾选", () => {
		const { selected, view } = renderSelection({});
		act(() => view.result.current.toggle("a"));
		view.rerender({ search: { status: "draft" } });
		view.rerender({ search: {} });
		expect(selected()).toEqual([]);
	});
});
