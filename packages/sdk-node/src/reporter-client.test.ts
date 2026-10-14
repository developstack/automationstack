import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { IngestEmptyWriteError } from "./errors.js";
import type { FetchLike } from "./http-client.js";
import { AutomationStackReporter } from "./reporter-client.js";
import { INGEST_RUNS_ROUTE } from "./route-paths.js";

const RUN_KEY = "3f2a1b4c-5d6e-4f70-8912-a3b4c5d6e7f8";
const BASE_OPTIONS = {
	baseUrl: "https://qa.example.com",
	idempotencyKey: RUN_KEY,
	projectId: "11111111-2222-4333-8444-555555555555",
	sleep: () => Promise.resolve(),
	token: "as_secret",
};

interface Recorded {
	body: unknown;
	url: string;
}

/** 按顺序回放 responses 的 reporter，并记下每一次请求。 */
function reporterWith(
	responses: unknown[],
	sink: (line: string) => void = () => undefined
) {
	const calls: Recorded[] = [];
	const queue = [...responses];
	const fetchImpl: FetchLike = (url, init) => {
		calls.push({
			body: init.body ? JSON.parse(String(init.body)) : null,
			url,
		});
		const next = queue.shift();
		if (next instanceof Response) {
			return Promise.resolve(next);
		}
		return Promise.resolve(Response.json(next ?? {}));
	};
	const reporter = new AutomationStackReporter({
		...BASE_OPTIONS,
		fetchImpl,
		sink,
	});
	return { calls, reporter };
}

const keysOf = (calls: Recorded[]) =>
	calls.map((call) => (call.body as { idempotencyKey: string }).idempotencyKey);

const receiptWith = (writtenTo: unknown[]) => ({
	executionId: "22222222-3333-4444-8555-666666666666",
	outOfScope: [],
	skippedManual: [],
	unmatchedCases: [],
	writtenTo,
});

const wroteRunA = (updated: number) =>
	receiptWith([{ runId: "run-a", runName: "v2.3 回归", updated }]);

let previousExitCode: typeof process.exitCode;

beforeEach(() => {
	previousExitCode = process.exitCode;
});

afterEach(() => {
	process.exitCode = previousExitCode;
});

describe("编程式入口（框架无关）", () => {
	it("addResult 只入缓冲，finish 之前一个网络请求都没有（D29）；正常路径不调任何预检接口（§7.2 第 5 条）", async () => {
		const { calls, reporter } = reporterWith([wroteRunA(2)]);
		reporter.addResult({ result: "passed", sourceRef: "A-1" });
		reporter.addResult({ result: "failed", sourceRef: "A-2" });
		expect(calls).toHaveLength(0);
		expect(reporter.pendingResultCount).toBe(2);

		await reporter.finish();
		expect(calls.map((call) => call.url)).toEqual([
			"https://qa.example.com/ingest/executions",
		]);
		expect(calls.some((call) => call.url.includes(INGEST_RUNS_ROUTE))).toBe(
			false
		);
	});

	it("重试复用同一个幂等键（§7.2 第 2 条）", async () => {
		const { calls, reporter } = reporterWith([
			new Response("boom", { status: 503 }),
			Response.json(wroteRunA(1)),
		]);
		reporter.addResult({ result: "passed", sourceRef: "A-1" });
		await reporter.finish();
		expect(keysOf(calls)).toEqual([RUN_KEY, RUN_KEY]);
	});

	it("writtenTo 为空时抛错、置非零退出码，并原样透传服务端理由", async () => {
		const lines: string[] = [];
		const { reporter } = reporterWith(
			[
				{
					...receiptWith([]),
					unmatchedCases: [
						{
							reason: "项目里没有这个 sourceRef 的用例",
							sourceRef: "PAY-NEW-099",
						},
					],
				},
			],
			(line) => lines.push(line)
		);
		reporter.addResult({ result: "passed", sourceRef: "PAY-NEW-099" });

		const error = await reporter.finish().catch((thrown: unknown) => thrown);
		expect(error).toBeInstanceOf(IngestEmptyWriteError);
		expect(process.exitCode).toBe(1);
		expect(String((error as Error).message)).toContain(
			"项目里没有这个 sourceRef 的用例"
		);
		expect(lines.join("\n")).toContain("PAY-NEW-099");
	});

	it("写进去了就不动退出码", async () => {
		const { reporter } = reporterWith([wroteRunA(1)]);
		reporter.addResult({ result: "passed", sourceRef: "A-1" });
		const outcome = await reporter.finish();
		expect(process.exitCode).toBe(previousExitCode);
		expect(outcome.receipt.writtenTo).toHaveLength(1);
		expect(outcome.attachments).toBeNull();
	});

	it("超过 200 条时分多次 POST，键各不相同但都落在同一条端点上", async () => {
		const { calls, reporter } = reporterWith([wroteRunA(200), wroteRunA(50)]);
		reporter.addResults(
			Array.from({ length: 250 }, (_, index) => ({
				result: "passed" as const,
				sourceRef: `A-${index}`,
			}))
		);
		const outcome = await reporter.finish();
		expect(calls).toHaveLength(2);
		expect(new Set(calls.map((call) => call.url)).size).toBe(1);
		expect(new Set(keysOf(calls)).size).toBe(2);
		expect(outcome.receipt.writtenTo).toEqual([
			{ runId: "run-a", runName: "v2.3 回归", updated: 250 },
		]);
	});
});
