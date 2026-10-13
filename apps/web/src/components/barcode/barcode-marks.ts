// 条形码式进度条的竖线分配。一条竖线表示一个或多个数量（通常是用例条数）。

/** 一条条形码式进度条最多画的竖线条数。 */
export const DEFAULT_MAX_MARKS = 120;

export interface MarkAllocation {
	casesPerMark: number;
	marks: number[];
}

function sumOf(values: readonly number[]): number {
	return values.reduce((sum, value) => sum + value, 0);
}

function indexOfMax(values: readonly number[]): number {
	return values.reduce(
		(best, value, index) => (value > (values[best] ?? 0) ? index : best),
		0
	);
}

/** 最大余数法：先取整，不为 0 的分段至少一条，再按小数部分补足或从最大的分段扣除。 */
function scaleToTotal(counts: readonly number[], markTotal: number): number[] {
	const caseTotal = sumOf(counts);
	const exact = counts.map((count) => (count * markTotal) / caseTotal);
	const marks = exact.map((value, index) =>
		(counts[index] ?? 0) > 0 ? Math.max(1, Math.floor(value)) : 0
	);
	const byRemainder = exact
		.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
		.sort((a, b) => b.remainder - a.remainder);
	let leftover = markTotal - sumOf(marks);
	for (const { index } of byRemainder) {
		if (leftover <= 0) {
			break;
		}
		marks[index] = (marks[index] ?? 0) + 1;
		leftover -= 1;
	}
	while (leftover < 0) {
		const largest = indexOfMax(marks);
		marks[largest] = (marks[largest] ?? 0) - 1;
		leftover += 1;
	}
	return marks;
}

/** 竖线总数不超过 maxMarks，按各分段的数量分配。 */
export function allocateMarks(
	counts: readonly number[],
	maxMarks: number
): MarkAllocation {
	const caseTotal = sumOf(counts);
	if (caseTotal <= maxMarks) {
		return { casesPerMark: 1, marks: [...counts] };
	}
	return {
		casesPerMark: Math.round(caseTotal / maxMarks),
		marks: scaleToTotal(counts, maxMarks),
	};
}

/** 比例说明，例如「每条竖线表示 1 条用例」。不能整除时说明是约数。 */
export function barcodeScaleNote(
	counts: readonly number[],
	maxMarks: number = DEFAULT_MAX_MARKS
): string {
	const { casesPerMark, marks } = allocateMarks(counts, maxMarks);
	const exact = casesPerMark * sumOf(marks) === sumOf(counts);
	return exact
		? `每条竖线表示 ${casesPerMark} 条用例`
		: `每条竖线约表示 ${casesPerMark} 条用例`;
}
