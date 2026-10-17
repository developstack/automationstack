import { describe, expect, it } from "vitest";

import {
	type PageSelectionState,
	pageSelectionState,
	toggleId,
	togglePageIds,
} from "@/components/interaction/page-selection";

const PAGE = ["a", "b"];

describe("pageSelectionState：当前页的勾选情况", () => {
	it.each<[string, string[], string[], PageSelectionState]>([
		["当前页都勾选", ["a", "b", "x"], PAGE, "all"],
		["当前页勾选了一部分", ["a", "x"], PAGE, "some"],
		["只勾选了其他页的行", ["x"], PAGE, "none"],
		["当前页没有行", ["x"], [], "none"],
	])("%s", (_name, selected, pageIds, expected) => {
		expect(pageSelectionState(new Set(selected), pageIds)).toBe(expected);
	});
});

describe("togglePageIds：表头勾选框选中或取消当前页，其他页的勾选不变", () => {
	it.each<[string, string[], string[]]>([
		["当前页没有全选：选中当前页", ["a", "x"], ["a", "b", "x"]],
		["当前页已经全选：取消当前页", ["a", "b", "x"], ["x"]],
	])("%s", (_name, selected, expected) => {
		expect([...togglePageIds(new Set(selected), PAGE)].sort()).toEqual(
			expected
		);
	});
});

it("toggleId：勾选或取消一行，不修改原来的集合", () => {
	const selected = new Set(["a"]);
	expect([...toggleId(selected, "b")]).toEqual(["a", "b"]);
	expect([...toggleId(selected, "a")]).toEqual([]);
	expect([...selected]).toEqual(["a"]);
});
