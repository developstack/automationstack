import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type { TestRunStepResult } from "@automationstack/db/schema/test-runs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
	RunStepCard,
	type RunStepCardProps,
} from "@/components/test-runs/run-step-card";

const SHOT_A = "11111111-1111-4111-8111-11111111111a";
const SHOT_B = "11111111-1111-4111-8111-11111111111b";

const IMAGE_URLS = new Map<string, string | null>([
	[SHOT_A, "https://r2.example/a.png"],
	[SHOT_B, "https://r2.example/b.png"],
]);

const ACTUAL_RESULT_NAME = /实际结果/;
const UPLOAD_NAME = /添加|上传/;
const ACTUAL_TEXT = /支付超时/;
const OLD_REASON_LABELS = /失败原因|阻塞原因/;
const FAILED_NAME = /失败/;

const STEP: CaseStep = {
	actionScreenshots: [SHOT_A],
	expected: "进入工作台",
	expectedScreenshots: [SHOT_B],
	id: "s2",
	step: "登录",
};

function renderCard(overrides: Partial<RunStepCardProps> = {}) {
	const props: RunStepCardProps = {
		actualResult: "",
		editing: false,
		imageUrls: IMAGE_URLS,
		index: 1,
		onActualResultChange: vi.fn(),
		onPick: vi.fn(),
		result: undefined,
		step: STEP,
		...overrides,
	};
	render(<RunStepCard {...props} />);
	return props;
}

const srcs = (list: HTMLElement) =>
	[...list.querySelectorAll("img")].map((image) => image.getAttribute("src"));

const actualField = () =>
	screen.getByRole("textbox", { name: ACTUAL_RESULT_NAME });

describe("RunStepCard：执行页的步骤卡片", () => {
	it("shows the images that the step text embeds, and not the old screenshots field", () => {
		const legacyStep = {
			expected: "进入工作台",
			id: "s2",
			screenshots: [SHOT_B],
			step: `登录 ![](attachment:${SHOT_A})`,
		} as CaseStep;
		renderCard({ step: legacyStep });
		expect(
			screen.getAllByRole("img").map((image) => image.getAttribute("src"))
		).toEqual(["https://r2.example/a.png"]);
		expect(screen.queryByRole("list")).toBeNull();
	});

	it.each([
		["view mode", false],
		["edit mode", true],
	])(
		"shows three columns in %s, with read-only action and expected screenshots",
		(_mode, editing) => {
			renderCard({ editing });
			for (const column of ["步骤", "预期结果", "实际结果"]) {
				expect(screen.getByRole("heading", { name: column })).toBeTruthy();
			}
			expect(screen.getByText("登录")).toBeTruthy();
			expect(screen.getByText("进入工作台")).toBeTruthy();
			const action = screen.getByRole("list", { name: "第 2 步操作截图" });
			const expected = screen.getByRole("list", { name: "第 2 步预期截图" });
			expect(srcs(action)).toEqual(["https://r2.example/a.png"]);
			expect(srcs(expected)).toEqual(["https://r2.example/b.png"]);
			expect(screen.queryByRole("button", { name: UPLOAD_NAME })).toBeNull();
		}
	);

	it("passes the typed actual result with the step id", () => {
		const props = renderCard({ editing: true, result: "passed" });
		fireEvent.change(actualField(), { target: { value: "页面正常" } });
		expect(props.onActualResultChange).toHaveBeenCalledWith("s2", "页面正常");
	});

	it.each<[TestRunStepResult | undefined, string, boolean, boolean]>([
		["failed", "", true, true],
		["blocked", "", true, true],
		["failed", "支付超时", true, false],
		["passed", "", false, false],
		["skipped", "", false, false],
		[undefined, "", false, false],
	])(
		"verdict %s with actual result %j: required %s, invalid %s",
		(result, actualResult, required, invalid) => {
			renderCard({ actualResult, editing: true, result });
			const field = actualField();
			expect(field.getAttribute("aria-required")).toBe(String(required));
			expect(field.getAttribute("aria-invalid")).toBe(String(invalid));
		}
	);

	it("shows the actual result read-only, without the verdict picker or the old reason labels, when not editing", () => {
		renderCard({ actualResult: "支付超时\n订单没回滚", result: "failed" });
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.queryByRole("radiogroup")).toBeNull();
		expect(screen.getByText(ACTUAL_TEXT).textContent).toBe(
			"支付超时\n订单没回滚"
		);
		expect(screen.queryByText(OLD_REASON_LABELS)).toBeNull();
	});

	it("shows the verdict picker on the card when editing", () => {
		const props = renderCard({ editing: true });
		const picker = screen.getByRole("radiogroup", { name: "步骤 2 的判定" });
		fireEvent.click(within(picker).getByRole("radio", { name: FAILED_NAME }));
		expect(props.onPick).toHaveBeenCalledWith("s2", "failed");
	});
});
