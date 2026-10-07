import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	MINDMAP_MERGE_DELAY_MS,
	MINDMAP_MERGE_MAX_WAIT_MS,
	TrailingMerge,
} from "./mindmap-refresh-merge.ts";

function createMerge(canFlush: () => boolean = () => true) {
	const flushed: string[] = [];
	const merge = new TrailingMerge<string>({
		canFlush,
		delayMs: MINDMAP_MERGE_DELAY_MS,
		maxWaitMs: MINDMAP_MERGE_MAX_WAIT_MS,
		now: () => Date.now(),
		onFlush: (value) => {
			flushed.push(value);
		},
	});
	return { flushed, merge };
}

const BURST_GAP_MS = 20;
const STEADY_TICKS = 20;
const STEADY_GAP_MS = 100;
const MAX_FLUSHES_IN_STEADY_STREAM = 3;
const BUSY_WINDOWS = 4;
const PAST_MAX_WAIT_FACTOR = 2;

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("TrailingMerge 合并窗口", () => {
	it("merges a burst of invalidates into a single flush", () => {
		const { flushed, merge } = createMerge();
		for (const value of ["a", "b", "c", "d", "e"]) {
			merge.push(value);
			vi.advanceTimersByTime(BURST_GAP_MS);
		}
		expect(flushed).toEqual([]);
		vi.advanceTimersByTime(MINDMAP_MERGE_DELAY_MS);
		expect(flushed).toEqual(["e"]);
		expect(merge.hasPending()).toBe(false);
	});

	it("does not flush before the trailing window elapses", () => {
		const { flushed, merge } = createMerge();
		merge.push("a");
		vi.advanceTimersByTime(MINDMAP_MERGE_DELAY_MS - 1);
		expect(flushed).toEqual([]);
		vi.advanceTimersByTime(1);
		expect(flushed).toEqual(["a"]);
	});

	it("starts a fresh window for the next burst", () => {
		const { flushed, merge } = createMerge();
		merge.push("a");
		vi.advanceTimersByTime(MINDMAP_MERGE_DELAY_MS);
		merge.push("b");
		vi.advanceTimersByTime(MINDMAP_MERGE_DELAY_MS);
		expect(flushed).toEqual(["a", "b"]);
	});
});

describe("TrailingMerge 的 maxWait 上限", () => {
	it("flushes at maxWaitMs even while values keep arriving", () => {
		const { flushed, merge } = createMerge();
		for (let tick = 0; tick < STEADY_TICKS; tick += 1) {
			merge.push(`v${tick}`);
			vi.advanceTimersByTime(STEADY_GAP_MS);
		}
		expect(flushed.length).toBeGreaterThan(0);
		expect(flushed.length).toBeLessThanOrEqual(MAX_FLUSHES_IN_STEADY_STREAM);
	});
});

describe("TrailingMerge 在画布忙时的行为", () => {
	it("keeps the snapshot parked while the canvas is busy", () => {
		let busy = true;
		const { flushed, merge } = createMerge(() => !busy);
		merge.push("a");
		vi.advanceTimersByTime(MINDMAP_MERGE_DELAY_MS * BUSY_WINDOWS);
		expect(flushed).toEqual([]);
		expect(merge.hasPending()).toBe(true);
		merge.push("b");
		busy = false;
		vi.advanceTimersByTime(MINDMAP_MERGE_DELAY_MS);
		expect(flushed).toEqual(["b"]);
	});

	it("retry() only fires once the trailing window has elapsed", () => {
		let busy = true;
		const { flushed, merge } = createMerge(() => !busy);
		merge.push("a");
		busy = false;
		merge.retry();
		expect(flushed).toEqual([]);
		vi.advanceTimersByTime(MINDMAP_MERGE_DELAY_MS);
		expect(flushed).toEqual(["a"]);
	});

	it("retry() redraws immediately once the canvas goes idle", () => {
		let busy = true;
		const { flushed, merge } = createMerge(() => !busy);
		merge.push("a");
		vi.advanceTimersByTime(MINDMAP_MERGE_DELAY_MS);
		expect(flushed).toEqual([]);
		busy = false;
		merge.retry();
		expect(flushed).toEqual(["a"]);
	});
});

describe("TrailingMerge 的取消与空转", () => {
	it("cancel() drops the parked snapshot and its timer", () => {
		const { flushed, merge } = createMerge();
		merge.push("a");
		merge.cancel();
		expect(merge.hasPending()).toBe(false);
		vi.advanceTimersByTime(MINDMAP_MERGE_MAX_WAIT_MS * PAST_MAX_WAIT_FACTOR);
		expect(flushed).toEqual([]);
	});

	it("retry() on an empty scheduler is a no-op", () => {
		const { flushed, merge } = createMerge();
		merge.retry();
		vi.advanceTimersByTime(MINDMAP_MERGE_MAX_WAIT_MS);
		expect(flushed).toEqual([]);
	});
});
