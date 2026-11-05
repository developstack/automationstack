import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunStepsSummary } from "@/components/test-runs/run-steps-summary";

function renderSummary(
	missingActualResult: number[],
	missingVerdict: number[]
) {
	const handlers = { onPassAll: vi.fn(), onReset: vi.fn(), onSave: vi.fn() };
	render(
		<RunStepsSummary
			derived="failed"
			dirty
			editing
			missingActualResult={missingActualResult}
			missingVerdict={missingVerdict}
			saving={false}
			unjudged={0}
			{...handlers}
		/>
	);
	fireEvent.click(screen.getByRole("button", { name: "保存判定" }));
	fireEvent.click(screen.getByRole("button", { name: "一键全部通过" }));
	return handlers;
}

const BLOCKED_TEXT = /才能保存/;

describe("RunStepsSummary：保存判定", () => {
	it.each([
		[
			"a failed or blocked step has no actual result",
			[2, 4],
			[],
			"步骤 2、4 判为失败或阻塞，填写实际结果后才能保存",
		],
		[
			"a step without a verdict has an actual result",
			[],
			[1, 3],
			"步骤 1、3 有实际结果但没有判定，选择判定后才能保存",
		],
	])(
		"blocks the save and names the steps while %s",
		(_name, missingActualResult, missingVerdict, message) => {
			const handlers = renderSummary(missingActualResult, missingVerdict);
			expect(screen.getByText(BLOCKED_TEXT).textContent).toBe(message);
			expect(handlers.onSave).not.toHaveBeenCalled();
			expect(handlers.onPassAll).toHaveBeenCalledTimes(1);
		}
	);

	it("saves when every step with an actual result has a verdict and every failed or blocked step has an actual result", () => {
		const handlers = renderSummary([], []);
		expect(screen.queryByText(BLOCKED_TEXT)).toBeNull();
		expect(handlers.onSave).toHaveBeenCalledTimes(1);
	});
});
