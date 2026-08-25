import { Hono } from "hono";
import { beforeEach, expect, test, vi } from "vitest";
import {
	INGEST_ATTACHMENTS_PRESIGN_ROUTE,
	INGEST_ATTACHMENTS_REGISTER_ROUTE,
	INGEST_EXECUTIONS_ROUTE,
	INGEST_RUNS_ROUTE,
} from "./route-paths";
// `vi.mock` 由 vitest 提升到所有 import 之前，所以下面这几个静态 import
// 拿到的已经是换过的 handler，一行 db 都不会被加载。
import { registerIngestRoutes } from "./routes";

/**
 * 对外那张 URL 表本身（§5.1.1 / §5.6）。
 *
 * 这四行是 SDK 照着拼 URL 的东西，改一个字符就是改协议，所以逐字钉死；
 * 再验一遍 `registerIngestRoutes` 真的把四条都挂上了——少挂一条的表现是
 * 「SDK 拿到 404，以为是自己 baseUrl 写错了」。
 */

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

test("四条路径互不相同，也没有一条以斜杠结尾", () => {
	const paths = [
		INGEST_ATTACHMENTS_PRESIGN_ROUTE,
		INGEST_ATTACHMENTS_REGISTER_ROUTE,
		INGEST_EXECUTIONS_ROUTE,
		INGEST_RUNS_ROUTE,
	];
	expect(new Set(paths).size).toBe(paths.length);
	for (const path of paths) {
		expect(path.startsWith("/ingest/")).toBe(true);
		expect(path.endsWith("/")).toBe(false);
	}
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

test("没有 /ingest/target 这类端点，也不认没注册过的路径", async () => {
	// D31：没有任何地方接受「往哪写」作为输入，这条断言就是那句话的看门狗。
	const app = buildApp();
	const target = await app.request("/ingest/target", {
		body: "{}",
		method: "POST",
	});
	expect(target.status).toBe(404);
	const unknown = await app.request("/ingest/attachments", { method: "GET" });
	expect(unknown.status).toBe(404);
});

test("方法不对就当没这条路由：POST /ingest/runs 不会走进 GET 的 handler", async () => {
	const app = buildApp();
	const response = await app.request(INGEST_RUNS_ROUTE, {
		body: "{}",
		method: "POST",
	});
	expect(response.status).toBe(404);
	expect(executionMocks.handleIngestRuns).not.toHaveBeenCalled();
});
