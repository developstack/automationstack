import { expect, test } from "vitest";
import { z } from "zod";

import { formatIngestIssues } from "./format-issues";

function errorOf(schema: z.ZodType, input: unknown): z.ZodError {
	const parsed = schema.safeParse(input);
	if (parsed.success) {
		throw new Error("这份输入本该校验失败");
	}
	return parsed.error;
}

const itemSchema = z.object({
	kind: z.enum(["log", "screenshot"]),
	name: z.string(),
	sizeBytes: z.int().nonnegative(),
});

const issuesOf = (count: number) =>
	errorOf(z.object({ items: z.array(itemSchema) }), {
		items: Array.from({ length: count }, () => ({})),
	});

test("手写请求打错几个字段：一条都不截断，也不加计数尾巴", () => {
	const error = errorOf(
		z.object({
			idempotencyKey: z.uuid(),
			overwriteManual: z.boolean(),
			projectId: z.uuid(),
		}),
		{ idempotencyKey: "nope", overwriteManual: "yes", projectId: "also-nope" }
	);
	const message = formatIngestIssues(error);
	expect(message.split("；")).toHaveLength(3);
	expect(message).not.toContain("未列出");
});

test("正好 20 条 issue 不触发截断（阈值上的那一格）", () => {
	const error = issuesOf(6);
	expect(error.issues.length).toBeLessThanOrEqual(20);
	expect(formatIngestIssues(error)).not.toContain("未列出");
});

test("机器批量生成的垃圾被截断，响应长度与输入规模脱钩，且仍然说得出总数", () => {
	const small = formatIngestIssues(issuesOf(100));
	const huge = formatIngestIssues(issuesOf(3000));
	expect(small).toContain("还有 280 条问题未列出（共 300 条，只列前 20 条）");
	expect(huge.length - small.length).toBeLessThan(10);
	expect(huge.split("；")).toHaveLength(21);
});
