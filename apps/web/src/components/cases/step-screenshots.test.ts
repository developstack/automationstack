import { MAX_STEP_SCREENSHOTS } from "@automationstack/api/schemas/case";
import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { describe, expect, it } from "vitest";

import {
	isLocalScreenshot,
	localScreenshotIds,
	newLocalScreenshotId,
	planScreenshotAdd,
	resolveStepScreenshots,
	runWithConcurrency,
	withoutStepScreenshot,
} from "@/components/cases/step-screenshots";

const MIB = 1024 * 1024;

function image(name: string, type = "image/png", size = 1024): File {
	const file = new File(["x"], name, { type });
	Object.defineProperty(file, "size", { value: size });
	return file;
}

const LOCAL_A = "local:a";
const LOCAL_B = "local:b";
const SAVED = "11111111-1111-4111-8111-111111111111";

function step(id: string, screenshots?: string[]): CaseStep {
	return {
		expected: "",
		id,
		step: "",
		...(screenshots === undefined ? {} : { screenshots }),
	};
}

const GIF_ERROR = /a\.gif：不支持/;
const SIZE_ERROR = /big\.png：图片超过 10MB/;
const LIMIT_ERROR = /最多 9 张截图，2 张没有加入/;
const NO_ERROR = /^$/;

describe("planScreenshotAdd", () => {
	const png = image("a.png");
	it.each([
		{
			accepted: 3,
			error: NO_ERROR,
			existing: 0,
			files: [png, image("b.jpg", "image/jpeg"), image("c.webp", "image/webp")],
			name: "accepts PNG, JPEG and WebP",
		},
		{
			accepted: 0,
			error: GIF_ERROR,
			existing: 0,
			files: [image("a.gif", "image/gif")],
			name: "rejects other types",
		},
		{
			accepted: 0,
			error: SIZE_ERROR,
			existing: 0,
			files: [image("big.png", "image/png", 11 * MIB)],
			name: "rejects files over 10 MB",
		},
		{
			accepted: 1,
			error: LIMIT_ERROR,
			existing: MAX_STEP_SCREENSHOTS - 1,
			files: [png, png, png],
			name: "stops at 9 screenshots for one step",
		},
	])("$name", ({ accepted, error, existing, files }) => {
		const plan = planScreenshotAdd(files, existing);
		expect(plan.accepted).toHaveLength(accepted);
		expect(plan.error ?? "").toMatch(error);
	});
});

describe("local screenshot ids", () => {
	const steps = [
		step("s1", [LOCAL_A, SAVED]),
		step("s2"),
		step("s3", [LOCAL_B]),
	];

	it("marks new screenshots as local and lists them in editor order", () => {
		expect(isLocalScreenshot(newLocalScreenshotId())).toBe(true);
		expect(isLocalScreenshot(SAVED)).toBe(false);
		expect(localScreenshotIds(steps)).toEqual([LOCAL_A, LOCAL_B]);
	});

	it("replaces local ids with attachment ids and keeps the order", () => {
		const uploaded = new Map([
			[LOCAL_A, "id-a"],
			[LOCAL_B, "id-b"],
		]);
		expect(resolveStepScreenshots(steps, uploaded)).toEqual([
			step("s1", ["id-a", SAVED]),
			step("s2"),
			step("s3", ["id-b"]),
		]);
	});

	it("refuses to resolve a screenshot that was not uploaded", () => {
		expect(() => resolveStepScreenshots(steps, new Map())).toThrow(LOCAL_A);
	});
});

describe("withoutStepScreenshot", () => {
	const STEPS = [step("s1", [SAVED, LOCAL_A]), step("s2", [SAVED])];

	it.each([
		[
			"removes the screenshot from that step only",
			"s1",
			SAVED,
			[[LOCAL_A], [SAVED]],
		],
		[
			"keeps the steps when the step is unknown",
			"s9",
			SAVED,
			[[SAVED, LOCAL_A], [SAVED]],
		],
		[
			"keeps the step when the id is unknown",
			"s2",
			LOCAL_B,
			[[SAVED, LOCAL_A], [SAVED]],
		],
	])("%s", (_name, stepId, attachmentId, expected) => {
		const result = withoutStepScreenshot(STEPS, stepId, attachmentId);
		expect(result.map((item) => item.screenshots)).toEqual(expected);
		expect(STEPS.map((item) => item.screenshots)).toEqual([
			[SAVED, LOCAL_A],
			[SAVED],
		]);
	});
});

describe("runWithConcurrency", () => {
	it.each([
		[5, 3, 3],
		[2, 3, 2],
		[0, 3, 0],
	])(
		"%i items with a limit of %i run at most %i at a time, results in order",
		async (count, limit, expectedPeak) => {
			let running = 0;
			let peak = 0;
			const items = Array.from({ length: count }, (_, index) => index);
			const results = await runWithConcurrency(items, limit, async (item) => {
				running += 1;
				peak = Math.max(peak, running);
				await Promise.resolve();
				running -= 1;
				return item * 2;
			});
			expect(peak).toBe(expectedPeak);
			expect(results).toEqual(items.map((item) => item * 2));
		}
	);
});
