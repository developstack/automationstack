import { expect, test } from "vitest";

import {
	formatCommitShort,
	formatExecutionCounts,
	isExecutionIncomplete,
} from "@/components/test-runs/report-automation-meta";

test("commit 取 7 位短 hash，没有 commit 时给 null 而不是空串", () => {
	expect(formatCommitShort("a3f9c2d1e4b5a6")).toBe("a3f9c2d");
	expect(formatCommitShort("a3f9c2")).toBe("a3f9c2");
	expect(formatCommitShort(null)).toBeNull();
	expect(formatCommitShort("")).toBeNull();
});

test("跳过为 0 时也照说，不省略", () => {
	expect(formatExecutionCounts({ skippedCount: 1, updatedCount: 79 })).toBe(
		"刷新 79 条，跳过 1 条"
	);
	expect(formatExecutionCounts({ skippedCount: 0, updatedCount: 80 })).toBe(
		"刷新 80 条，跳过 0 条"
	);
});

test("completedAt 为 null 的那一轮是未完成的一轮", () => {
	expect(isExecutionIncomplete({ completedAt: null })).toBe(true);
	expect(isExecutionIncomplete({ completedAt: new Date() })).toBe(false);
});
