import { describe, expect, it } from "vitest";

import {
	CASE_FIELD_GRID_CLASS,
	CASE_FIELD_GRID_COLUMNS,
	CASE_FIELD_ROWS,
	CASE_FIELD_SPAN_CLASS,
	type CaseFieldKey,
} from "@/components/cases/case-form-grid";

const SPAN_PATTERN = /^sm:col-span-(\d+)$/;

/** 从 `sm:col-span-N` 里取出 N；类名写错时直接失败，而不是静默算成 0。 */
function spanOf(field: CaseFieldKey): number {
	const match = SPAN_PATTERN.exec(CASE_FIELD_SPAN_CLASS[field]);
	const span = match?.[1];
	if (span === undefined) {
		throw new Error(`字段 ${field} 的 col-span 类名格式不对`);
	}
	return Number(span);
}

describe("case form grid", () => {
	it("容器声明的列数与 CASE_FIELD_GRID_COLUMNS 一致", () => {
		expect(CASE_FIELD_GRID_CLASS).toContain(
			`sm:grid-cols-${CASE_FIELD_GRID_COLUMNS}`
		);
		// 窄屏必须回到单栏堆叠
		expect(CASE_FIELD_GRID_CLASS).toContain("grid-cols-1");
	});

	it("每一行都正好铺满全部轨道", () => {
		for (const row of CASE_FIELD_ROWS) {
			const total = row.reduce((sum, field) => sum + spanOf(field), 0);
			expect(total).toBe(CASE_FIELD_GRID_COLUMNS);
		}
	});

	it("每个短字段只出现在一行里，且没有字段被漏掉", () => {
		const placed = CASE_FIELD_ROWS.flat();
		expect(new Set(placed).size).toBe(placed.length);
		expect([...placed].sort()).toEqual(
			Object.keys(CASE_FIELD_SPAN_CLASS).sort()
		);
	});

	it("col-span 一律带 sm: 前缀，窄屏不会被拉成多栏", () => {
		for (const className of Object.values(CASE_FIELD_SPAN_CLASS)) {
			expect(className.startsWith("sm:")).toBe(true);
		}
	});
});
