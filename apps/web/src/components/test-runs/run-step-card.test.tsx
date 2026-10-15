import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunStepCard } from "@/components/test-runs/run-step-card";

const SHOT_A = "11111111-1111-4111-8111-11111111111a";
const SHOT_B = "11111111-1111-4111-8111-11111111111b";

const IMAGE_URLS = new Map<string, string | null>([
	[SHOT_A, "https://r2.example/a.png"],
	[SHOT_B, null],
]);

const THUMB_NAME = /^放大查看/;

function renderCard(step: CaseStep, editing = false) {
	return render(
		<RunStepCard
			comment=""
			editing={editing}
			imageUrls={IMAGE_URLS}
			index={1}
			onCommentChange={vi.fn()}
			onPick={vi.fn()}
			result={undefined}
			step={step}
		/>
	);
}

describe("RunStepCard：执行页的步骤截图", () => {
	it.each([false, true])(
		"shows the screenshots without a delete button (editing: %s)",
		(editing) => {
			renderCard(
				{
					expected: "进入工作台",
					id: "s2",
					screenshots: [SHOT_A, SHOT_B],
					step: "登录",
				},
				editing
			);
			expect(screen.getByRole("list", { name: "第 2 步截图" })).toBeTruthy();
			const thumbs = screen.getAllByRole("button", { name: THUMB_NAME });
			expect(thumbs.map((thumb) => thumb.className)).toEqual([
				expect.stringContaining("h-22.5 w-30"),
				expect.stringContaining("h-22.5 w-30"),
			]);
			expect(screen.queryByRole("button", { name: "删除截图" })).toBeNull();
			fireEvent.click(thumbs[1] as HTMLElement);
			expect(screen.getByText("2 / 2")).toBeTruthy();
		}
	);

	it("has no screenshot area for a step without screenshots", () => {
		renderCard({ expected: "", id: "s2", step: "登录" });
		expect(screen.queryByRole("list", { name: "第 2 步截图" })).toBeNull();
	});
});
