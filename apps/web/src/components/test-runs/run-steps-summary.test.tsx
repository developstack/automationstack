import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunStepsSummary } from "@/components/test-runs/run-steps-summary";

function renderSummary(missingActualResult: number[]) {
	const handlers = { onPassAll: vi.fn(), onReset: vi.fn(), onSave: vi.fn() };
	render(
		<RunStepsSummary
			derived="failed"
			dirty
			editing
			missingActualResult={missingActualResult}
			saving={false}
			unjudged={0}
			{...handlers}
		/>
	);
	fireEvent.click(screen.getByRole("button", { name: "保存判定" }));
	fireEvent.click(screen.getByRole("button", { name: "一键全部通过" }));
	return handlers;
}

const MISSING_TEXT = /填写实际结果后才能保存/;

describe("RunStepsSummary：保存判定", () => {
	it("blocks the save and names the steps while a failed or blocked step has no actual result", () => {
		const handlers = renderSummary([2, 4]);
		expect(screen.getByText(MISSING_TEXT).textContent).toBe(
			"步骤 2、4 判为失败或阻塞，填写实际结果后才能保存"
		);
		expect(handlers.onSave).not.toHaveBeenCalled();
		expect(handlers.onPassAll).toHaveBeenCalledTimes(1);
	});

	it("saves when every failed or blocked step has an actual result", () => {
		const handlers = renderSummary([]);
		expect(screen.queryByText(MISSING_TEXT)).toBeNull();
		expect(handlers.onSave).toHaveBeenCalledTimes(1);
	});
});
