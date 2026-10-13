import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
	enteringRowIds,
	useEnteringRowIds,
} from "@/components/cases/case-row-enter";

describe("enteringRowIds：改筛选条件和翻页后，只有新出现的行淡入", () => {
	it("第一次显示列表时没有行淡入，页面整体已经有进入动效", () => {
		expect([...enteringRowIds(null, ["a", "b"])]).toEqual([]);
	});

	it("新结果中留下的行不淡入，只有新出现的行淡入", () => {
		expect([...enteringRowIds(["a", "b", "c"], ["b", "d", "c", "e"])]).toEqual([
			"d",
			"e",
		]);
	});

	it("翻到完全不同的一页时，每一行都淡入", () => {
		expect([...enteringRowIds(["a", "b"], ["c", "d"])]).toEqual(["c", "d"]);
	});

	it("结果没有变化时没有行淡入", () => {
		expect([...enteringRowIds(["a", "b"], ["a", "b"])]).toEqual([]);
	});
});

describe("useEnteringRowIds：表格在空状态或骨架屏之后出现时，所有行淡入", () => {
	it("animateFirst 为 true 时，第一次显示的每一行都淡入", () => {
		const { result } = renderHook(() =>
			useEnteringRowIds(["a", "b"], { animateFirst: true })
		);
		expect([...result.current]).toEqual(["a", "b"]);
	});

	it("animateFirst 为 false 时，第一次显示的行不淡入；之后只有新行淡入", () => {
		const { rerender, result } = renderHook(
			({ ids }) => useEnteringRowIds(ids, { animateFirst: false }),
			{ initialProps: { ids: ["a", "b"] } }
		);
		expect([...result.current]).toEqual([]);
		rerender({ ids: ["b", "c"] });
		expect([...result.current]).toEqual(["c"]);
	});
});
