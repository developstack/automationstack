import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
	CaseImageUpload,
	CaseImageUploadResult,
} from "@/components/cases/use-case-attachment-upload";
import {
	type ScreenshotUploadOutcome,
	useStepScreenshots,
} from "@/components/cases/use-step-screenshots";

URL.createObjectURL = vi.fn(() => "blob:local");
URL.revokeObjectURL = vi.fn();

const SAVED = "99999999-9999-4999-8999-999999999999";

/** 文件名以 fail 开头的文件第一次上传失败，重试时成功。记录每次上传和同时上传的峰值。 */
function scriptedUploader(options: { draft?: boolean } = {}) {
	const uploaded: string[] = [];
	const failedOnce = new Set<string>();
	let running = 0;
	const stats = { peak: 0 };
	const uploader: CaseImageUpload = {
		storageUnavailable: false,
		upload: async (file): Promise<CaseImageUploadResult> => {
			running += 1;
			stats.peak = Math.max(stats.peak, running);
			await new Promise((resolve) => setTimeout(resolve, 0));
			running -= 1;
			uploaded.push(file.name);
			if (file.name.startsWith("fail") && !failedOnce.has(file.name)) {
				failedOnce.add(file.name);
				return { kind: "failed", reason: "网络中断" };
			}
			const attachmentId = `id-${file.name}`;
			const draft = options.draft
				? {
						fileName: file.name,
						id: attachmentId,
						storageKey: `k/${file.name}`,
					}
				: undefined;
			return { attachmentId, draft, kind: "ok" };
		},
	};
	return { stats, uploaded, uploader };
}

const png = (name: string) => new File(["x"], name, { type: "image/png" });

function setup(names: string[], options: { draft?: boolean } = {}) {
	const script = scriptedUploader(options);
	const hook = renderHook(() => useStepScreenshots(script.uploader));
	let ids: string[] = [];
	act(() => {
		ids = hook.result.current.add(names.map(png));
	});
	const steps: CaseStep[] = [
		{ expected: "", id: "s1", screenshots: [ids[0] ?? "", SAVED], step: "" },
		{ expected: "", id: "s2", screenshots: ids.slice(1), step: "" },
	];
	return { hook, ids, script, steps };
}

async function uploadAll(
	hook: ReturnType<typeof setup>["hook"],
	steps: CaseStep[]
): Promise<ScreenshotUploadOutcome> {
	let outcome: ScreenshotUploadOutcome | undefined;
	await act(async () => {
		outcome = await hook.result.current.uploadAll(steps);
	});
	if (outcome === undefined) {
		throw new Error("uploadAll 没有返回结果");
	}
	return outcome;
}

describe("useStepScreenshots：保存时上传步骤截图", () => {
	it("adds files without uploading them", () => {
		const { hook, ids, script } = setup(["a.png", "b.png"]);
		expect(script.uploaded).toEqual([]);
		expect(ids.map((id) => hook.result.current.shots.get(id)?.status)).toEqual([
			"pending",
			"pending",
		]);
	});

	it("uploads at most 3 at a time and returns steps with attachment ids in editor order", async () => {
		const names = ["a.png", "b.png", "c.png", "d.png", "e.png"];
		const { hook, script, steps } = setup(names, { draft: true });
		const outcome = await uploadAll(hook, steps);
		expect(script.stats.peak).toBe(3);
		expect(outcome).toEqual({
			attachments: names.map((name) => ({
				fileName: name,
				id: `id-${name}`,
				storageKey: `k/${name}`,
			})),
			kind: "ok",
			steps: [
				{ ...steps[0], screenshots: ["id-a.png", SAVED] },
				{
					...steps[1],
					screenshots: ["id-b.png", "id-c.png", "id-d.png", "id-e.png"],
				},
			],
		});
		expect(hook.result.current.progress).toBeNull();
	});

	it("a failed upload fails the save; retry and the next save upload only the failed screenshot", async () => {
		const { hook, ids, script, steps } = setup([
			"a.png",
			"fail-b.png",
			"fail-c.png",
		]);
		expect(await uploadAll(hook, steps)).toEqual({ failed: 2, kind: "failed" });
		const failedId = ids[1] ?? "";
		expect(hook.result.current.shots.get(failedId)).toMatchObject({
			error: "网络中断",
			status: "failed",
		});

		await act(async () => {
			hook.result.current.retry(failedId);
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
		expect(hook.result.current.shots.get(failedId)?.status).toBe("uploaded");

		const outcome = await uploadAll(hook, steps);
		expect(outcome.kind).toBe("ok");
		expect(script.uploaded).toEqual([
			"a.png",
			"fail-b.png",
			"fail-c.png",
			"fail-b.png",
			"fail-c.png",
		]);
	});

	it("discard and clear drop local screenshots", () => {
		const { hook, ids } = setup(["a.png", "b.png"]);
		act(() => hook.result.current.discard(ids[0] ?? ""));
		expect([...hook.result.current.shots.keys()]).toEqual([ids[1]]);
		act(() => hook.result.current.clear());
		expect(hook.result.current.shots.size).toBe(0);
	});
});
