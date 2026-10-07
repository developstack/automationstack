import { expect, test } from "vitest";
import { z } from "zod";

import { formatIngestIssues } from "./format-issues";

const itemSchema = z.object({
	kind: z.enum(["log", "screenshot"]),
	name: z.string(),
	sizeBytes: z.int().nonnegative(),
});

function issuesOf(count: number): z.ZodError {
	const parsed = z
		.object({ items: z.array(itemSchema) })
		.safeParse({ items: Array.from({ length: count }, () => ({})) });
	if (parsed.success) {
		throw new Error("这份输入本该校验失败");
	}
	return parsed.error;
}

test("手写请求打错几个字段：一条都不截断，也不加计数尾巴", () => {
	const parsed = z
		.object({
			idempotencyKey: z.uuid(),
			overwriteManual: z.boolean(),
			projectId: z.uuid(),
		})
		.safeParse({
			idempotencyKey: "nope",
			overwriteManual: "yes",
			projectId: "also-nope",
		});
	if (parsed.success) {
		throw new Error("这份输入本该校验失败");
	}
	const message = formatIngestIssues(parsed.error);
	expect(message.split("；")).toHaveLength(3);
	expect(message).not.toContain("未列出");
});

test("正好 20 条 issue 不触发截断（阈值上的那一格）", () => {
	const error = issuesOf(6);
	expect(error.issues.length).toBeLessThanOrEqual(20);
	expect(formatIngestIssues(error)).not.toContain("未列出");
});

test("机器批量生成的垃圾被截断，且响应长度与输入规模脱钩", () => {
	const small = formatIngestIssues(issuesOf(100));
	const huge = formatIngestIssues(issuesOf(3000));
	expect(small).toContain("未列出");
	expect(huge.length - small.length).toBeLessThan(10);
	expect(huge.split("；")).toHaveLength(21);
});

test("截断之后仍然说得出总数，「我错了多少条」这个信息不丢", () => {
	const message = formatIngestIssues(issuesOf(100));
	expect(message).toContain("还有 280 条问题未列出（共 300 条，只列前 20 条）");
});
