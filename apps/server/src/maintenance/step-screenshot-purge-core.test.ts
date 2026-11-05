import type { QueuedStepScreenshot } from "@automationstack/db/repositories/step-screenshot-purge-repository";
import { describe, expect, it, vi } from "vitest";

import {
	runStepScreenshotPurge,
	STEP_SCREENSHOT_PURGE_USAGE,
	type StepScreenshotPurgeDeps,
} from "./step-screenshot-purge-core";

const item = (n: number): QueuedStepScreenshot => ({
	attachmentId: `00000000-0000-4000-8000-00000000000${n}`,
	storageKey: `test-cases/p/c/${n}.png`,
});

const QUEUE = [item(1), item(2), item(3)];

function makeDeps(overrides: Partial<StepScreenshotPurgeDeps> = {}) {
	const lines: string[] = [];
	const remove = vi.fn((_key: string) => Promise.resolve());
	const deps: StepScreenshotPurgeDeps = {
		dequeue: vi.fn(() => Promise.resolve()),
		findKeysInUse: vi.fn(() => Promise.resolve(new Set<string>())),
		listQueued: vi.fn(() => Promise.resolve(QUEUE)),
		log: (line) => lines.push(line),
		removeObject: remove,
		warn: (line) => lines.push(`WARN ${line}`),
		...overrides,
	};
	return { deps, lines, remove };
}

describe("runStepScreenshotPurge：R2 清理脚本", () => {
	it.each([[["--force"]], [["--apply", "extra"]]])(
		"rejects the arguments %j and changes nothing",
		async (args) => {
			const { deps } = makeDeps();
			expect(await runStepScreenshotPurge(args, deps)).toEqual({
				kind: "error",
				message: STEP_SCREENSHOT_PURGE_USAGE,
			});
			expect(deps.listQueued).not.toHaveBeenCalled();
		}
	);

	it("lists every queued object by default and deletes nothing", async () => {
		const { deps, lines, remove } = makeDeps();
		const result = await runStepScreenshotPurge([], deps);
		expect(result).toEqual({
			kind: "done",
			report: { deleted: 0, failed: 0, listed: 3, mode: "dry-run", skipped: 0 },
		});
		for (const { storageKey } of QUEUE) {
			expect(lines).toContain(storageKey);
		}
		expect(remove).not.toHaveBeenCalled();
		expect(deps.dequeue).not.toHaveBeenCalled();
	});

	it("deletes each object with --apply, then removes it from the queue", async () => {
		const { deps, remove } = makeDeps();
		const result = await runStepScreenshotPurge(["--apply"], deps);
		expect(result).toEqual({
			kind: "done",
			report: { deleted: 3, failed: 0, listed: 3, mode: "apply", skipped: 0 },
		});
		expect(remove.mock.calls.map(([key]) => key)).toEqual(
			QUEUE.map((queued) => queued.storageKey)
		);
		expect(vi.mocked(deps.dequeue).mock.calls.map(([id]) => id)).toEqual(
			QUEUE.map((queued) => queued.attachmentId)
		);
	});

	it.each(["dry-run", "apply"] as const)(
		"skips an object that an attachment row still uses (%s)",
		async (mode) => {
			const inUse = item(2).storageKey;
			const { deps, lines, remove } = makeDeps({
				findKeysInUse: () => Promise.resolve(new Set([inUse])),
			});
			const args = mode === "apply" ? ["--apply"] : [];
			const result = await runStepScreenshotPurge(args, deps);
			expect(result).toMatchObject({ report: { skipped: 1 } });
			expect(lines.some((line) => line.startsWith(`WARN 跳过 ${inUse}`))).toBe(
				true
			);
			expect(remove).not.toHaveBeenCalledWith(inUse);
			expect(deps.dequeue).not.toHaveBeenCalledWith(item(2).attachmentId);
		}
	);

	it("continues after a failed deletion and keeps the failed object in the queue", async () => {
		const failing = item(1).storageKey;
		const { deps, lines } = makeDeps({
			removeObject: vi.fn((key: string) =>
				key === failing
					? Promise.reject(new Error("AccessDenied"))
					: Promise.resolve()
			),
		});
		const result = await runStepScreenshotPurge(["--apply"], deps);
		expect(result).toMatchObject({ report: { deleted: 2, failed: 1 } });
		expect(deps.dequeue).not.toHaveBeenCalledWith(item(1).attachmentId);
		expect(lines).toContain(`WARN 删除失败 ${failing}：AccessDenied`);
	});

	it("refuses --apply when R2 is not configured", async () => {
		const { deps } = makeDeps({ removeObject: null });
		expect(await runStepScreenshotPurge(["--apply"], deps)).toMatchObject({
			kind: "error",
		});
		expect(deps.dequeue).not.toHaveBeenCalled();
	});

	it("says so when the queue is empty", async () => {
		const { deps, lines } = makeDeps({ listQueued: () => Promise.resolve([]) });
		const result = await runStepScreenshotPurge(["--apply"], deps);
		expect(result).toMatchObject({ report: { listed: 0 } });
		expect(lines).toContain("没有要删除的对象。");
	});
});
