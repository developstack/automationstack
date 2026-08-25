import { describe, expect, it } from "vitest";

import { resolveReporterConfig } from "./config";
import {
	MAX_INGEST_COMMENT_LENGTH,
	RESULTS_PER_BATCH,
} from "./contract-limits";
import { buildExecutionRequests, chunkResults } from "./execution-batches";
import type { CaseResultInput } from "./reporter-types";

const RUN_KEY = "3f2a1b4c-5d6e-4f70-8912-a3b4c5d6e7f8";
const config = resolveReporterConfig({
	baseUrl: "https://qa.example.com",
	idempotencyKey: RUN_KEY,
	projectId: "11111111-2222-4333-8444-555555555555",
	token: "as_secret",
});
const window = { finishedAt: null, startedAt: null };

const makeResults = (count: number): CaseResultInput[] =>
	Array.from({ length: count }, (_, index) => ({
		result: "passed" as const,
		sourceRef: `CASE-${index}`,
	}));

describe("批量提交（§7.2 第 1 条 / D29）", () => {
	it("一轮结果攒成一个请求，而不是一条一个请求", () => {
		const requests = buildExecutionRequests({
			config,
			results: makeResults(80),
			window,
		});
		expect(requests).toHaveLength(1);
		expect(requests[0]?.results).toHaveLength(80);
	});

	it("超过 200 条才分批（§5.5）", () => {
		expect(chunkResults(makeResults(RESULTS_PER_BATCH))).toHaveLength(1);
		expect(chunkResults(makeResults(RESULTS_PER_BATCH + 1))).toHaveLength(2);
	});

	it("空结果仍然发一批，理由要由服务端的对账单说出来", () => {
		const requests = buildExecutionRequests({ config, results: [], window });
		expect(requests).toHaveLength(1);
		expect(requests[0]?.results).toEqual([]);
	});

	it("每批一个不同的幂等键，且都从同一个 run key 确定性派生", () => {
		const results = makeResults(RESULTS_PER_BATCH * 2 + 5);
		const first = buildExecutionRequests({ config, results, window });
		const retried = buildExecutionRequests({ config, results, window });
		const keys = first.map((request) => request.idempotencyKey);
		expect(keys).toHaveLength(3);
		expect(new Set(keys).size).toBe(3);
		expect(keys[0]).toBe(RUN_KEY);
		// 重试同一轮：算出来的还是同一组键（§7.2 第 2 条）。
		expect(retried.map((request) => request.idempotencyKey)).toEqual(keys);
	});

	it("请求体里没有单数 runId——服务端把它声明成了 z.never()", () => {
		const [request] = buildExecutionRequests({
			config,
			results: makeResults(1),
			window,
		});
		expect(request && "runId" in request).toBe(false);
		expect(request?.runIds).toBeNull();
	});

	it("超长 message 在 SDK 侧就截断，并留一句话说明被截了", () => {
		const [request] = buildExecutionRequests({
			config,
			results: [
				{
					message: "x".repeat(MAX_INGEST_COMMENT_LENGTH * 3),
					result: "failed",
					sourceRef: "CASE-1",
				},
			],
			window,
		});
		const message = request?.results[0]?.message ?? "";
		expect(message.length).toBe(MAX_INGEST_COMMENT_LENGTH);
		expect(message).toContain("log 附件");
	});

	it("时间窗按 ISO 字符串发出去", () => {
		const startedAt = new Date("2026-08-25T06:00:00.000Z");
		const [request] = buildExecutionRequests({
			config,
			results: makeResults(1),
			window: { finishedAt: null, startedAt },
		});
		expect(request?.startedAt).toBe("2026-08-25T06:00:00.000Z");
		expect(request?.finishedAt).toBeNull();
	});
});
