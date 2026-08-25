import { expect, test } from "vitest";

import {
	ingestExecutionRequestSchema,
	ingestRunsQuerySchema,
	MAX_INGEST_MESSAGE_LENGTH,
	MAX_INGEST_RESULTS_PER_REQUEST,
	MAX_INGEST_SOURCE_REF_LENGTH,
} from "./execution-contract";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const IDEMPOTENCY_KEY = "22222222-2222-4222-8222-222222222222";

const MINIMAL = {
	idempotencyKey: IDEMPOTENCY_KEY,
	projectId: PROJECT_ID,
	results: [{ result: "passed" as const, sourceRef: "PAY-LOGIN-001" }],
};

test("只带必填字段也能解析：可选项全部有默认值，SDK 不必发全套", () => {
	const parsed = ingestExecutionRequestSchema.parse(MINIMAL);
	expect(parsed.branch).toBeNull();
	expect(parsed.ciUrl).toBeNull();
	expect(parsed.commitSha).toBeNull();
	expect(parsed.finishedAt).toBeNull();
	expect(parsed.startedAt).toBeNull();
	expect(parsed.overwriteManual).toBe(false);
	expect(parsed.runIds).toBeNull();
});

test("Z 与 ±hh:mm 两种时区写法都收，落成 Date", () => {
	const parsed = ingestExecutionRequestSchema.parse({
		...MINIMAL,
		finishedAt: "2026-08-25T06:14:22+08:00",
		startedAt: "2026-08-25T06:00:00Z",
	});
	expect(parsed.startedAt?.toISOString()).toBe("2026-08-25T06:00:00.000Z");
	expect(parsed.finishedAt?.toISOString()).toBe("2026-08-24T22:14:22.000Z");
});

test("不带时区的本地时间拒绝：那是歧义值，落库后还原不出是哪一刻", () => {
	expect(
		ingestExecutionRequestSchema.safeParse({
			...MINIMAL,
			startedAt: "2026-08-25T06:00:00",
		}).success
	).toBe(false);
});

test("untested 不是自动化能报的结论（否则 db 层直接抛异常）", () => {
	expect(
		ingestExecutionRequestSchema.safeParse({
			...MINIMAL,
			results: [{ result: "untested", sourceRef: "PAY-LOGIN-001" }],
		}).success
	).toBe(false);
});

test("durationMs 收下但不落库；schema 不因它拒绝请求", () => {
	const parsed = ingestExecutionRequestSchema.parse({
		...MINIMAL,
		results: [
			{
				durationMs: 1820,
				result: "passed" as const,
				sourceRef: "PAY-LOGIN-001",
			},
		],
	});
	expect(parsed.results[0]?.durationMs).toBe(1820);
});

test("D31：runIds 只有复数白名单，空数组与 null 是两回事", () => {
	expect(
		ingestExecutionRequestSchema.parse({ ...MINIMAL, runIds: [] }).runIds
	).toEqual([]);
	expect(
		ingestExecutionRequestSchema.parse({ ...MINIMAL, runIds: null }).runIds
	).toBeNull();
});

test("D31：顶层 runId 显式 400，而不是被静默 strip 掉", () => {
	const parsed = ingestExecutionRequestSchema.safeParse({
		...MINIMAL,
		runId: "33333333-3333-4333-8333-333333333333",
	});
	expect(parsed.success).toBe(false);
	const [issue] = parsed.error?.issues ?? [];
	expect(issue?.path).toEqual(["runId"]);
	// 静默 strip 会让上报方拿到 200、以为只写了那一个任务，实际写进了全部候选。
	expect(issue?.message).toContain("runIds");
	expect(issue?.message).toContain("sourceRef");
});

test("不声明的新字段仍然放行：schema 不是 strict，SDK 以后加字段不该硬失败", () => {
	expect(
		ingestExecutionRequestSchema.safeParse({ ...MINIMAL, sdkVersion: "1.2.0" })
			.success
	).toBe(true);
});

test("results 超过条数上限时整批拒绝，且说清是「分批重发」不是数据有问题", () => {
	const oversized = Array.from(
		{ length: MAX_INGEST_RESULTS_PER_REQUEST + 1 },
		(_unused, index) => ({
			result: "passed" as const,
			sourceRef: `PAY-${index}`,
		})
	);
	const parsed = ingestExecutionRequestSchema.safeParse({
		...MINIMAL,
		results: oversized,
	});
	expect(parsed.success).toBe(false);
	expect(parsed.error?.issues[0]?.message).toContain("分批重发");
	// 恰好等于上限要放行：上限是闸门，不是「少一条才安全」。
	expect(
		ingestExecutionRequestSchema.safeParse({
			...MINIMAL,
			results: oversized.slice(0, MAX_INGEST_RESULTS_PER_REQUEST),
		}).success
	).toBe(true);
});

test("超长 sourceRef 在契约层就被拒，不会安静地掉进 unmatchedCases", () => {
	expect(
		ingestExecutionRequestSchema.safeParse({
			...MINIMAL,
			results: [
				{
					result: "passed",
					sourceRef: "x".repeat(MAX_INGEST_SOURCE_REF_LENGTH + 1),
				},
			],
		}).success
	).toBe(false);
	expect(
		ingestExecutionRequestSchema.safeParse({
			...MINIMAL,
			results: [
				{
					result: "passed",
					sourceRef: "x".repeat(MAX_INGEST_SOURCE_REF_LENGTH),
				},
			],
		}).success
	).toBe(true);
});

test("message 的受理上限远大于展示截断：正常的长堆栈照收，截断照常发生", () => {
	expect(
		ingestExecutionRequestSchema.safeParse({
			...MINIMAL,
			results: [
				{
					message: "x".repeat(MAX_INGEST_MESSAGE_LENGTH),
					result: "failed",
					sourceRef: "PAY-LOGIN-001",
				},
			],
		}).success
	).toBe(true);
	expect(
		ingestExecutionRequestSchema.safeParse({
			...MINIMAL,
			results: [
				{
					message: "x".repeat(MAX_INGEST_MESSAGE_LENGTH + 1),
					result: "failed",
					sourceRef: "PAY-LOGIN-001",
				},
			],
		}).success
	).toBe(false);
});

test("results 允许为空：过滤条件没匹配到用例的那一轮照样该留下执行记录", () => {
	expect(
		ingestExecutionRequestSchema.parse({ ...MINIMAL, results: [] }).results
	).toEqual([]);
});

test("GET /ingest/runs 只认 projectId", () => {
	expect(ingestRunsQuerySchema.parse({ projectId: PROJECT_ID }).projectId).toBe(
		PROJECT_ID
	);
	expect(ingestRunsQuerySchema.safeParse({ projectId: "nope" }).success).toBe(
		false
	);
});
