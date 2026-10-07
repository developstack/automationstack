import { Hono } from "hono";
import { beforeEach, expect, test, vi } from "vitest";

import { MAX_INGEST_BODY_BYTES } from "./body-limit";
import { registerIngestExecutionRoutes } from "./execution-routes";
import { HTTP_PAYLOAD_TOO_LARGE, INVALID_JSON_MESSAGE } from "./responses";

const mocks = vi.hoisted(() => ({
	handleIngestExecution: vi.fn(),
	handleIngestRuns: vi.fn(),
}));

vi.mock("@automationstack/api/lib/ingest/execution-ingest", () => mocks);

const AUTHORIZATION = "Bearer as_live_token";
const RECEIPT = {
	executionId: "33333333-3333-4333-8333-333333333333",
	outOfScope: [],
	skippedManual: [],
	unmatchedCases: [],
	writtenTo: [],
};

function buildApp(): Hono {
	const app = new Hono();
	registerIngestExecutionRoutes(app);
	return app;
}

async function postExecutions(
	rawBody: string,
	authorized = true
): Promise<Response> {
	return await buildApp().request("/ingest/executions", {
		body: rawBody,
		headers: authorized
			? { authorization: AUTHORIZATION, "content-type": "application/json" }
			: { "content-type": "application/json" },
		method: "POST",
	});
}

beforeEach(() => {
	vi.resetAllMocks();
});

test("GET /ingest/runs：查询串原样交出去，这一层一个字都不解析", async () => {
	mocks.handleIngestRuns.mockResolvedValue({
		kind: "ok",
		response: { runs: [] },
	});
	const response = await buildApp().request(
		"/ingest/runs?projectId=not-a-uuid&extra=1",
		{ headers: { authorization: AUTHORIZATION } }
	);
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ runs: [] });
	expect(mocks.handleIngestRuns).toHaveBeenCalledWith({
		authorizationHeader: AUTHORIZATION,
		query: { extra: "1", projectId: "not-a-uuid" },
	});
});

test("GET /ingest/runs：没带 Authorization 时透传 null，401 带 WWW-Authenticate", async () => {
	mocks.handleIngestRuns.mockResolvedValue({ kind: "unauthorized" });
	const response = await buildApp().request("/ingest/runs?projectId=x");
	expect(response.status).toBe(401);
	expect(response.headers.get("www-authenticate")).toBe("Bearer");
	expect(mocks.handleIngestRuns).toHaveBeenCalledWith({
		authorizationHeader: null,
		query: { projectId: "x" },
	});
});

test("GET /ingest/runs：invalid-payload → 400，message 原样", async () => {
	mocks.handleIngestRuns.mockResolvedValue({
		kind: "invalid-payload",
		message: "projectId: 必须是 uuid",
	});
	const response = await buildApp().request("/ingest/runs");
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({
		error: "invalid-payload",
		message: "projectId: 必须是 uuid",
	});
});

test("GET /ingest/runs：project-not-found → 404，不与 401 混", async () => {
	mocks.handleIngestRuns.mockResolvedValue({ kind: "project-not-found" });
	const response = await buildApp().request("/ingest/runs?projectId=x");
	expect(response.status).toBe(404);
	expect(await response.json()).toMatchObject({ error: "project-not-found" });
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

test("POST /ingest/executions：Authorization 原样透传，body 是 parse 后的对象", async () => {
	mocks.handleIngestExecution.mockResolvedValue({
		kind: "ok",
		receipt: RECEIPT,
	});
	await postExecutions(JSON.stringify({ projectId: "p", results: [] }));
	expect(mocks.handleIngestExecution).toHaveBeenCalledWith({
		authorizationHeader: AUTHORIZATION,
		body: { projectId: "p", results: [] },
	});
});

test("POST /ingest/executions：unauthorized → 401 + WWW-Authenticate", async () => {
	mocks.handleIngestExecution.mockResolvedValue({ kind: "unauthorized" });
	const response = await postExecutions("{}", false);
	expect(response.status).toBe(401);
	expect(response.headers.get("www-authenticate")).toBe("Bearer");
	expect(mocks.handleIngestExecution).toHaveBeenCalledWith({
		authorizationHeader: null,
		body: {},
	});
});

test("POST /ingest/executions：invalid-payload → 400，字段名说明要到得了 SDK 手里", async () => {
	mocks.handleIngestExecution.mockResolvedValue({
		kind: "invalid-payload",
		message: "results.0.sourceRef: 必填",
	});
	const response = await postExecutions("{}");
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({
		error: "invalid-payload",
		message: "results.0.sourceRef: 必填",
	});
});

test("POST /ingest/executions：project-not-found → 404", async () => {
	mocks.handleIngestExecution.mockResolvedValue({ kind: "project-not-found" });
	const response = await postExecutions("{}");
	expect(response.status).toBe(404);
	expect(await response.json()).toMatchObject({ error: "project-not-found" });
});

test("POST /ingest/executions：duplicate-source-refs → 400，重复的逐条列出", async () => {
	mocks.handleIngestExecution.mockResolvedValue({
		kind: "duplicate-source-refs",
		sourceRefs: ["PAY-LOGIN-001", "PAY-LOGIN-002"],
	});
	const response = await postExecutions("{}");
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({
		error: "duplicate-source-refs",
		message: "同一批结果里有重复的 sourceRef，整批未受理；请合并后重发",
		sourceRefs: ["PAY-LOGIN-001", "PAY-LOGIN-002"],
	});
});

test("POST /ingest/executions：writtenTo 为空**仍然是 200**，对账单原样", async () => {
	mocks.handleIngestExecution.mockResolvedValue({
		kind: "ok",
		receipt: RECEIPT,
	});
	const response = await postExecutions("{}");
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(RECEIPT);
});

test("POST /ingest/executions：超 16 MiB 直接 413，handler 碰都碰不到", async () => {
	const response = await buildApp().request("/ingest/executions", {
		body: "{}",
		headers: { "content-length": String(MAX_INGEST_BODY_BYTES + 1) },
		method: "POST",
	});
	expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
	expect(mocks.handleIngestExecution).not.toHaveBeenCalled();
});

test("handler 抛出来的真故障不被吞掉：500，而不是伪装成一次成功的上报", async () => {
	mocks.handleIngestExecution.mockRejectedValue(
		new Error("connect ECONNREFUSED")
	);
	const response = await postExecutions("{}");
	expect(response.status).toBe(500);
});
