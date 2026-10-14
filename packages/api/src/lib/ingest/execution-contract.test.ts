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

const parse = (extra: object) =>
	ingestExecutionRequestSchema.parse({ ...MINIMAL, ...extra });
const safeParse = (extra: object) =>
	ingestExecutionRequestSchema.safeParse({ ...MINIMAL, ...extra });
const withResult = (fields: object) => ({
	results: [{ result: "passed", sourceRef: "PAY-LOGIN-001", ...fields }],
});
const resultsOf = (count: number) => ({
	results: Array.from({ length: count }, (_unused, index) => ({
		result: "passed",
		sourceRef: `PAY-${index}`,
	})),
});

test("只带必填字段也能解析：可选项全部有默认值，SDK 不必发全套", () => {
	expect(parse({})).toMatchObject({
		branch: null,
		ciUrl: null,
		commitSha: null,
		finishedAt: null,
		overwriteManual: false,
		runIds: null,
		startedAt: null,
	});
});

test("Z 与 ±hh:mm 两种时区写法都收，落成 Date", () => {
	const parsed = parse({
		finishedAt: "2026-08-25T06:14:22+08:00",
		startedAt: "2026-08-25T06:00:00Z",
	});
	expect(parsed.startedAt?.toISOString()).toBe("2026-08-25T06:00:00.000Z");
	expect(parsed.finishedAt?.toISOString()).toBe("2026-08-24T22:14:22.000Z");
});

test.each([
	[
		"不带时区的本地时间拒绝：那是歧义值，落库后还原不出是哪一刻",
		{ startedAt: "2026-08-25T06:00:00" },
		false,
	],
	[
		"untested 不是自动化能报的结论（否则 db 层直接抛异常）",
		withResult({ result: "untested" }),
		false,
	],
	[
		"durationMs 声明了就要校验：负数是 400，而不是被静默 strip 掉",
		withResult({ durationMs: -1 }),
		false,
	],
	[
		"不声明的新字段仍然放行：schema 不是 strict，SDK 以后加字段不该硬失败",
		{ sdkVersion: "1.2.0" },
		true,
	],
	[
		"超长 sourceRef 在契约层就被拒，不会安静地掉进 unmatchedCases",
		withResult({ sourceRef: "x".repeat(MAX_INGEST_SOURCE_REF_LENGTH + 1) }),
		false,
	],
	[
		"sourceRef 正好在长度上限上仍然收",
		withResult({ sourceRef: "x".repeat(MAX_INGEST_SOURCE_REF_LENGTH) }),
		true,
	],
	[
		"message 的受理上限远大于展示截断：正常的长堆栈照收",
		withResult({
			message: "x".repeat(MAX_INGEST_MESSAGE_LENGTH),
			result: "failed",
		}),
		true,
	],
	[
		"message 超过受理上限拒绝",
		withResult({
			message: "x".repeat(MAX_INGEST_MESSAGE_LENGTH + 1),
			result: "failed",
		}),
		false,
	],
	[
		"results 正好在条数上限上仍然收",
		resultsOf(MAX_INGEST_RESULTS_PER_REQUEST),
		true,
	],
])("%s", (_name, extra, success) => {
	expect(safeParse(extra).success).toBe(success);
});

test("durationMs 收下但不落库；schema 不因它拒绝请求", () => {
	expect(parse(withResult({ durationMs: 1820 })).results[0]?.durationMs).toBe(
		1820
	);
});

test("D31：runIds 只有复数白名单，空数组与 null 是两回事", () => {
	expect(parse({ runIds: [] }).runIds).toEqual([]);
	expect(parse({ runIds: null }).runIds).toBeNull();
});

test("D31：顶层 runId 显式 400，而不是被静默 strip 掉", () => {
	const parsed = safeParse({ runId: "33333333-3333-4333-8333-333333333333" });
	expect(parsed.success).toBe(false);
	const [issue] = parsed.error?.issues ?? [];
	expect(issue?.path).toEqual(["runId"]);
	expect(issue?.message).toContain("runIds");
	expect(issue?.message).toContain("sourceRef");
});

test("results 超过条数上限时整批拒绝，且说清是「分批重发」不是数据有问题", () => {
	const parsed = safeParse(resultsOf(MAX_INGEST_RESULTS_PER_REQUEST + 1));
	expect(parsed.success).toBe(false);
	expect(parsed.error?.issues[0]?.message).toContain("分批重发");
});

test("results 允许为空：过滤条件没匹配到用例的那一轮照样该留下执行记录", () => {
	expect(parse({ results: [] }).results).toEqual([]);
});

test("GET /ingest/runs 只认 projectId", () => {
	expect(ingestRunsQuerySchema.parse({ projectId: PROJECT_ID }).projectId).toBe(
		PROJECT_ID
	);
	expect(ingestRunsQuerySchema.safeParse({ projectId: "nope" }).success).toBe(
		false
	);
});
