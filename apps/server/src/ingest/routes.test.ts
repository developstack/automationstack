import { Hono } from "hono";
import { beforeEach, expect, test, vi } from "vitest";
import {
	INGEST_ATTACHMENTS_PRESIGN_ROUTE,
	INGEST_ATTACHMENTS_REGISTER_ROUTE,
	INGEST_EXECUTIONS_ROUTE,
	INGEST_RUNS_ROUTE,
} from "./route-paths";
import { registerIngestRoutes } from "./routes";

const executionMocks = vi.hoisted(() => ({
	handleIngestExecution: vi.fn(),
	handleIngestRuns: vi.fn(),
}));
const attachmentMocks = vi.hoisted(() => ({
	handleIngestAttachmentPresign: vi.fn(),
	handleIngestAttachmentRegister: vi.fn(),
}));

vi.mock(
	"@automationstack/api/lib/ingest/execution-ingest",
	() => executionMocks
);
vi.mock(
	"@automationstack/api/lib/ingest/attachment-uploads",
	() => attachmentMocks
);

function buildApp(): Hono {
	const app = new Hono();
	registerIngestRoutes(app);
	return app;
}

beforeEach(() => {
	vi.resetAllMocks();
	const ok = { kind: "ok", receipt: {}, response: {} };
	executionMocks.handleIngestExecution.mockResolvedValue(ok);
	executionMocks.handleIngestRuns.mockResolvedValue(ok);
	attachmentMocks.handleIngestAttachmentPresign.mockResolvedValue(ok);
	attachmentMocks.handleIngestAttachmentRegister.mockResolvedValue(ok);
});

test("四条路径逐字就是对外公布的那张表", () => {
	expect(INGEST_RUNS_ROUTE).toBe("/ingest/runs");
	expect(INGEST_EXECUTIONS_ROUTE).toBe("/ingest/executions");
	expect(INGEST_ATTACHMENTS_PRESIGN_ROUTE).toBe("/ingest/attachments/presign");
	expect(INGEST_ATTACHMENTS_REGISTER_ROUTE).toBe(
		"/ingest/attachments/register"
	);
});

test("registerIngestRoutes 把四条全挂上了，一条都没漏", async () => {
	const app = buildApp();
	const runs = await app.request(`${INGEST_RUNS_ROUTE}?projectId=x`);
	expect(runs.status).toBe(200);
	const posted = await Promise.all(
		[
			INGEST_ATTACHMENTS_PRESIGN_ROUTE,
			INGEST_ATTACHMENTS_REGISTER_ROUTE,
			INGEST_EXECUTIONS_ROUTE,
		].map((route) => app.request(route, { body: "{}", method: "POST" }))
	);
	expect(posted.map((response) => response.status)).toEqual([200, 200, 200]);
});

// 没有 /ingest/target 这类端点；方法不对也当没这条路由
test.each([
	["POST", "/ingest/target"],
	["GET", "/ingest/attachments"],
	["POST", INGEST_RUNS_ROUTE],
])("没注册过的 %s %s → 404，不会走进任何 handler", async (method, path) => {
	const response = await buildApp().request(path, {
		body: method === "POST" ? "{}" : undefined,
		method,
	});
	expect(response.status).toBe(404);
	for (const handler of [
		...Object.values(executionMocks),
		...Object.values(attachmentMocks),
	]) {
		expect(handler).not.toHaveBeenCalled();
	}
});
