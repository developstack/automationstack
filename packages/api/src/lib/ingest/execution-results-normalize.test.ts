import { expect, test } from "vitest";
import { MAX_INGEST_COMMENT_LENGTH } from "./execution-contract";
import { passed } from "./execution-reconcile-fixtures";
import {
	findDuplicateSourceRefs,
	normalizeIngestComment,
} from "./execution-results-normalize";

test("重复 sourceRef 逐条列出，供上层整批拒绝", () => {
	expect(
		findDuplicateSourceRefs([
			passed("A"),
			passed("B"),
			passed("A"),
			passed("B"),
		])
	).toEqual(["A", "B"]);
	expect(findDuplicateSourceRefs([passed("A"), passed("B")])).toEqual([]);
});

test("空 message 折算成 null，超长按上限截断", () => {
	expect(normalizeIngestComment(null)).toBeNull();
	expect(normalizeIngestComment(undefined)).toBeNull();
	expect(normalizeIngestComment("   ")).toBeNull();
	expect(normalizeIngestComment("  boom  ")).toBe("boom");
	const long = "x".repeat(MAX_INGEST_COMMENT_LENGTH + 500);
	const truncated = normalizeIngestComment(long);
	expect(truncated).not.toBeNull();
	expect(truncated?.length).toBe(MAX_INGEST_COMMENT_LENGTH);
	expect(truncated?.endsWith("（已截断）")).toBe(true);
});
