import { Hono } from "hono";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { MAX_INGEST_BODY_BYTES } from "./body-limit";
import { registerIngestExecutionRoutes } from "./execution-routes";
import { HTTP_PAYLOAD_TOO_LARGE, INVALID_JSON_MESSAGE } from "./responses";

const mocks = vi.hoisted(() => ({
	handleIngestExecution: vi.fn(),
	handleIngestRuns: vi.fn(),
}));

vi.mock("@automationstack/api/lib/ingest/execution-ingest", () => mocks);

const AUTHORIZATION = "Bearer as_live_token";
const AUTHORIZED = { authorization: AUTHORIZATION };
const RECEIPT = {
	executionId: "33333333-3333-4333-8333-333333333333",
	outOfScope: [],
	skippedManual: [],
	unmatchedCases: [],
	writtenTo: [],
};

function request(path: string, init?: RequestInit): Promise<Response> {
	const app = new Hono();
	registerIngestExecutionRoutes(app);
	return Promise.resolve(app.request(path, init));
}

function postExecutions(
	rawBody: string,
	headers: Record<string, string> = AUTHORIZED
): Promise<Response> {
	return request("/ingest/executions", {
		body: rawBody,
		headers: { "content-type": "application/json", ...headers },
		method: "POST",
	});
}

beforeEach(() => {
	vi.resetAllMocks();
});

describe.each([
	{
		handler: mocks.handleIngestRuns,
		input: { query: { projectId: "x" } },
		name: "GET /ingest/runs",
		send: (headers: Record<string, string>) =>
			request("/ingest/runs?projectId=x", { headers }),
	},
	{
		handler: mocks.handleIngestExecution,
		input: { body: {} },
		name: "POST /ingest/executions",
		send: (headers: Record<string, string>) => postExecutions("{}", headers),
	},
])("$name", ({ handler, input, send }) => {
	test("没带 Authorization 时透传 null，401 带 WWW-Authenticate", async () => {
		handler.mockResolvedValue({ kind: "unauthorized" });
		const response = await send({});
		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toBe("Bearer");
		expect(handler).toHaveBeenCalledWith({
			authorizationHeader: null,
			...input,
		});
	});

	test("invalid-payload → 400，字段名说明原样到得了 SDK 手里", async () => {
		const message = "results.0.sourceRef: 必填";
		handler.mockResolvedValue({ kind: "invalid-payload", message });
		const response = await send(AUTHORIZED);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "invalid-payload",
			message,
		});
	});

	test("project-not-found → 404，不与 401 混", async () => {
		handler.mockResolvedValue({ kind: "project-not-found" });
		const response = await send(AUTHORIZED);
		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ error: "project-not-found" });
	});

	test("handler 抛出来的真故障不被吞掉：500，而不是伪装成一次成功的上报", async () => {
		handler.mockRejectedValue(new Error("connect ECONNREFUSED"));
		const response = await send(AUTHORIZED);
		expect(response.status).toBe(500);
	});
});

test("GET /ingest/runs：查询串原样交出去，这一层一个字都不解析", async () => {
	mocks.handleIngestRuns.mockResolvedValue({
		kind: "ok",
		response: { runs: [] },
	});
	const response = await request("/ingest/runs?projectId=not-a-uuid&extra=1", {
		headers: AUTHORIZED,
	});
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ runs: [] });
	expect(mocks.handleIngestRuns).toHaveBeenCalledWith({
		authorizationHeader: AUTHORIZATION,
		query: { extra: "1", projectId: "not-a-uuid" },
	});
});

test("POST /ingest/executions：body 不是 JSON → 400，handler 一次都没被调用", async () => {
	const response = await postExecutions("{ 这不是 JSON");
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({
		error: "invalid-payload",
		message: INVALID_JSON_MESSAGE,
	});
	expect(mocks.handleIngestExecution).not.toHaveBeenCalled();
});

test("POST /ingest/executions：Authorization 与 parse 后的 body 原样透传；writtenTo 为空**仍然是 200**，对账单原样", async () => {
	mocks.handleIngestExecution.mockResolvedValue({
		kind: "ok",
		receipt: RECEIPT,
	});
	const response = await postExecutions(
		JSON.stringify({ projectId: "p", results: [] })
	);
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(RECEIPT);
	expect(mocks.handleIngestExecution).toHaveBeenCalledWith({
		authorizationHeader: AUTHORIZATION,
		body: { projectId: "p", results: [] },
	});
});

test("POST /ingest/executions：duplicate-source-refs → 400，重复的逐条列出", async () => {
	const sourceRefs = ["PAY-LOGIN-001", "PAY-LOGIN-002"];
	mocks.handleIngestExecution.mockResolvedValue({
		kind: "duplicate-source-refs",
		sourceRefs,
	});
	const response = await postExecutions("{}");
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({
		error: "duplicate-source-refs",
		message: "同一批结果里有重复的 sourceRef，整批未受理；请合并后重发",
		sourceRefs,
	});
});

test("POST /ingest/executions：超 16 MiB 直接 413，handler 碰都碰不到", async () => {
	const response = await postExecutions("{}", {
		"content-length": String(MAX_INGEST_BODY_BYTES + 1),
	});
	expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
	expect(mocks.handleIngestExecution).not.toHaveBeenCalled();
});
