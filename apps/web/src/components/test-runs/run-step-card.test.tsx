import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RunStepCard } from "@/components/test-runs/run-step-card";

const SHOT_A = "11111111-1111-4111-8111-11111111111a";
const SHOT_B = "11111111-1111-4111-8111-11111111111b";

const IMAGE_URLS = new Map<string, string | null>([
	[SHOT_A, "https://r2.example/a.png"],
	[SHOT_B, "https://r2.example/b.png"],
]);

function renderCard(step: CaseStep) {
	return render(
		<RunStepCard
			comment=""
			editing={false}
			imageUrls={IMAGE_URLS}
			index={1}
			onCommentChange={vi.fn()}
			onPick={vi.fn()}
			result={undefined}
			step={step}
		/>
	);
}

describe("RunStepCard：执行页的步骤卡片", () => {
	it("shows the images that the step text embeds, and not the old screenshots field", () => {
		const legacyStep = {
			expected: "进入工作台",
			id: "s2",
			screenshots: [SHOT_B],
			step: `登录 ![](attachment:${SHOT_A})`,
		} as CaseStep;
		const { container } = renderCard(legacyStep);
		const images = [...container.querySelectorAll("img")];
		expect(images.map((image) => image.getAttribute("src"))).toEqual([
			"https://r2.example/a.png",
		]);
		expect(screen.queryByRole("list", { name: "第 2 步截图" })).toBeNull();
	});

	it.each([
		["a single paragraph inline", "进入工作台", "预期：进入工作台"],
		["several blocks below the label", "进入工作台\n\n- 显示菜单", "预期："],
	])("shows an expected result of %s", (_name, expected, label) => {
		renderCard({ expected, id: "s2", step: "登录" });
		expect(screen.getByText("预期：", { exact: false }).textContent).toBe(
			label
		);
		expect(screen.getByText("步骤 2")).toBeTruthy();
	});
});
