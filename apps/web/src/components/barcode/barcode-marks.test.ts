import { describe, expect, it } from "vitest";

import {
	allocateMarks,
	barcodeScaleNote,
	sharedBarcodeScale,
} from "@/components/barcode/barcode-marks";

describe("allocateMarks", () => {
	it("数量少于竖线上限时，一条竖线表示一个数量", () => {
		expect(allocateMarks([3, 2, 0], 120)).toEqual({
			casesPerMark: 1,
			marks: [3, 2, 0],
		});
	});

	it("数量多于上限时，竖线总数等于上限，按比例分配", () => {
		const result = allocateMarks([600, 300, 300], 120);

		expect(result.marks).toEqual([60, 30, 30]);
		expect(result.casesPerMark).toBe(10);
	});

	it("比例取整后的余数分给小数部分最大的分段，总数不变", () => {
		const result = allocateMarks([1, 1, 1], 2);

		expect(result.marks.reduce((sum, value) => sum + value, 0)).toBe(2);
	});

	it("数量不为 0 的分段至少有一条竖线", () => {
		const result = allocateMarks([1000, 1, 0], 100);

		expect(result.marks[1]).toBe(1);
		expect(result.marks[2]).toBe(0);
		expect(result.marks[0]).toBe(99);
	});

	it("没有数量时没有竖线", () => {
		expect(allocateMarks([0, 0, 0], 120)).toEqual({
			casesPerMark: 1,
			marks: [0, 0, 0],
		});
	});
});

describe("barcodeScaleNote", () => {
	it("能整除时说出每条竖线表示的条数", () => {
		expect(barcodeScaleNote([3, 2, 1], 120)).toBe("每条竖线表示 1 条用例");
	});

	it("不能整除时说明是约数", () => {
		expect(barcodeScaleNote([1000, 84, 200], 120)).toBe(
			"每条竖线约表示 11 条用例"
		);
	});
});

describe("sharedBarcodeScale", () => {
	it("并排的进度条都不超过上限时，一条竖线表示一条用例，每行的上限就是它的条数", () => {
		const scale = sharedBarcodeScale([40, 12], 60);

		expect(scale.casesPerMark).toBe(1);
		expect(scale.maxMarksFor(40)).toBe(40);
		expect(scale.note).toBe("每条竖线表示 1 条用例");
	});

	it("最大的一行超过上限时，所有行使用同一个比例，用例少的行竖线也少", () => {
		const scale = sharedBarcodeScale([600, 40], 60);

		expect(scale.casesPerMark).toBe(10);
		expect(allocateMarks([600], scale.maxMarksFor(600)).casesPerMark).toBe(10);
		expect(allocateMarks([40], scale.maxMarksFor(40)).casesPerMark).toBe(10);
		expect(scale.note).toBe("每条竖线约表示 10 条用例");
	});

	it("没有用例的行上限至少是 1", () => {
		expect(sharedBarcodeScale([0], 60).maxMarksFor(0)).toBe(1);
	});
});
