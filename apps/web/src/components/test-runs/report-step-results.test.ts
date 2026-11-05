import { describe, expect, it } from "vitest";

import { reportStepResults } from "@/components/test-runs/report-step-results";

function attachment(id: string, stepId: string | null, contentType: string) {
	return {
		attachment: {
			contentType,
			fileName: `${id}.file`,
			id,
			sizeBytes: 1,
			stepId,
		},
		url: `https://r2.example/${id}`,
	};
}

const step = (id: string, position: number, actualResult: string | null) => ({
	actualResult,
	id,
	position,
	step: `${id} 的操作`,
});

const ROW = {
	attachments: [
		attachment("shot", "s2", "image/png"),
		attachment("auto", null, "text/plain"),
		attachment("rec", "s3", "video/webm"),
		attachment("gone", "s9", "image/png"),
	],
	steps: [
		step("s1", 1, null),
		step("s2", 2, "页面白屏"),
		step("s3", 3, null),
		step("s4", 4, "   "),
	],
};

describe("报告中一条失败用例的步骤实际结果", () => {
	it("keeps only steps with actual result text or actual attachments, in step order", () => {
		expect(
			reportStepResults(ROW).map(({ actualResult, items, position }) => [
				position,
				actualResult,
				items.map(({ kind, name }) => [kind, name]),
			])
		).toEqual([
			[2, "页面白屏", [["image", "shot.file"]]],
			[3, null, [["video", "rec.file"]]],
		]);
	});

	it.each([
		["没有步骤结果", { attachments: [], steps: [step("s1", 1, null)] }],
		["没有步骤", { attachments: ROW.attachments, steps: [] }],
	])("%s：没有要显示的步骤", (_name, row) => {
		expect(reportStepResults(row)).toEqual([]);
	});
});
