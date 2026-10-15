import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";

import { isCaseFormDirty } from "@/components/cases/case-form-dirty";
import { emptyCaseFormValues } from "@/components/cases/case-meta";
import {
	hasStepScreenshots,
	mergeDraftAttachments,
	SCREENSHOTS_NOT_IN_DRAFT,
	saveButtonLabel,
	screenshotUploadFailedMessage,
	stepsWithoutScreenshots,
	uploadScreenshotsBeforeSave,
} from "@/components/cases/step-screenshot-save";
import type {
	ScreenshotUploadOutcome,
	StepScreenshotStore,
} from "@/components/cases/use-step-screenshots";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const OLD_STEP: CaseStep = { expected: "进入工作台", id: "s1", step: "登录" };
const SHOT = "11111111-1111-4111-8111-111111111111";
const withShots = (screenshots: string[]): CaseStep => ({
	...OLD_STEP,
	screenshots,
});

describe("saveButtonLabel", () => {
	it.each([
		["保存", null, "保存"],
		["保存", undefined, "保存"],
		["创建", { done: 2, total: 5 }, "上传截图 2/5"],
	])("%s with %o → %s", (label, progress, expected) => {
		expect(saveButtonLabel(label, progress)).toBe(expected);
	});
});

describe("步骤截图计入未保存的修改", () => {
	const baseline = { ...emptyCaseFormValues(), steps: [withShots(["a", "b"])] };
	it.each([
		["the same screenshots", [withShots(["a", "b"])], false],
		["an added screenshot", [withShots(["a", "b", "local:c"])], true],
		["a deleted screenshot", [withShots(["a"])], true],
		["reordered screenshots", [withShots(["b", "a"])], true],
	])("%s → dirty %s", (_name, steps, dirty) => {
		expect(isCaseFormDirty({ ...baseline, steps }, baseline)).toBe(dirty);
	});

	it("an old step without screenshots equals an empty list", () => {
		const old = { ...emptyCaseFormValues(), steps: [OLD_STEP] };
		expect(isCaseFormDirty({ ...old, steps: [withShots([])] }, old)).toBe(
			false
		);
	});
});

describe("草稿不保存步骤截图", () => {
	it("drops screenshots from every step and reports whether any existed", () => {
		const steps = [withShots(["local:a"]), OLD_STEP];
		expect(hasStepScreenshots(steps)).toBe(true);
		expect(stepsWithoutScreenshots(steps)).toEqual([OLD_STEP, OLD_STEP]);
		expect(hasStepScreenshots([OLD_STEP, withShots([])])).toBe(false);
		expect(SCREENSHOTS_NOT_IN_DRAFT).toBe("截图不随草稿保存");
	});
});

describe("mergeDraftAttachments", () => {
	it("keeps one entry per id", () => {
		const a = { fileName: "a.png", id: "a", storageKey: "k/a" };
		const b = { fileName: "b.png", id: "b", storageKey: "k/b" };
		expect(mergeDraftAttachments([a], [a, b])).toEqual([a, b]);
	});
});

describe("uploadScreenshotsBeforeSave", () => {
	const steps = [withShots(["local:a", SHOT])];
	const storeWith = (outcome: ScreenshotUploadOutcome) =>
		({
			uploadAll: vi.fn(async () => outcome),
		}) as unknown as StepScreenshotStore;

	it.each<[string, ScreenshotUploadOutcome, number]>([
		[
			"passes the resolved steps through",
			{ attachments: [], kind: "ok", steps: [withShots(["id-a", SHOT])] },
			0,
		],
		["reports a failed upload", { failed: 2, kind: "failed" }, 1],
	])("%s", async (_name, outcome, errors) => {
		vi.mocked(toast.error).mockClear();
		const store = storeWith(outcome);
		expect(await uploadScreenshotsBeforeSave(store, steps)).toEqual(outcome);
		expect(store.uploadAll).toHaveBeenCalledWith(steps);
		expect(toast.error).toHaveBeenCalledTimes(errors);
	});

	it("without a store returns the steps unchanged", async () => {
		expect(await uploadScreenshotsBeforeSave(null, steps)).toEqual({
			attachments: [],
			kind: "ok",
			steps,
		});
	});

	it("the failure message says the case was not saved", () => {
		expect(screenshotUploadFailedMessage(2)).toContain(
			"2 张截图上传失败，用例没有保存"
		);
	});
});
