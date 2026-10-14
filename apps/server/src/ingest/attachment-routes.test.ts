import { Hono } from "hono";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { registerIngestAttachmentRoutes } from "./attachment-routes";
import { MAX_INGEST_ATTACHMENT_BODY_BYTES } from "./body-limit";
import { HTTP_PAYLOAD_TOO_LARGE, INVALID_JSON_MESSAGE } from "./responses";

const mocks = vi.hoisted(() => ({
	handleIngestAttachmentPresign: vi.fn(),
	handleIngestAttachmentRegister: vi.fn(),
}));

vi.mock("@automationstack/api/lib/ingest/attachment-uploads", () => mocks);

const AUTHORIZATION = "Bearer as_live_token";
const PRESIGN = {
	handler: mocks.handleIngestAttachmentPresign,
	route: "/ingest/attachments/presign",
};
const REGISTER = {
	handler: mocks.handleIngestAttachmentRegister,
	route: "/ingest/attachments/register",
};

async function post(
	route: string,
	rawBody: string,
	headers: Record<string, string> = { authorization: AUTHORIZATION }
): Promise<Response> {
	const app = new Hono();
	registerIngestAttachmentRoutes(app);
	return await app.request(route, {
		body: rawBody,
		headers: { "content-type": "application/json", ...headers },
		method: "POST",
	});
}

beforeEach(() => {
	vi.resetAllMocks();
});

test.each([
	[
		"presign：R2 未配置是 **200 降级**，逐条 rejected，不是 5xx",
		PRESIGN,
		{ attachments: [], projectId: "p" },
		{
			expiresInSeconds: 300,
			rejected: [
				{ index: 0, reason: "存储未配置", runName: null, sourceRef: "PAY-001" },
			],
			storageConfigured: false,
			uploads: [],
		},
	],
	[
		"register：ok → 200，对账单原样（registered / rejected 都在）",
		REGISTER,
		{ a: 1 },
		{
			registered: [
				{
					attachmentId: "44444444-4444-4444-8444-444444444444",
					index: 0,
					runCaseId: "55555555-5555-4555-8555-555555555555",
					storageKey: "test-runs/p/r/rc/screenshot-x.png",
				},
			],
			rejected: [],
			storageConfigured: true,
		},
	],
])(
	"%s；Authorization 与 parse 后的 body 原样交给 handler",
	async (_name, { handler, route }, body, receipt) => {
		handler.mockResolvedValue({ kind: "ok", receipt });
		const response = await post(route, JSON.stringify(body));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(receipt);
		expect(handler).toHaveBeenCalledWith({
			authorizationHeader: AUTHORIZATION,
			body,
		});
	}
);

describe.each([
	{ advice: "请分批申请签名", ...PRESIGN },
	{ advice: "请分批登记", ...REGISTER },
])("$route", ({ advice, handler, route }) => {
	test("body 不是 JSON → 400，handler 一次都没被调用", async () => {
		const response = await post(route, "{ 这不是 JSON");
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "invalid-payload",
			message: INVALID_JSON_MESSAGE,
		});
		expect(handler).not.toHaveBeenCalled();
	});

	test("unauthorized → 401 + WWW-Authenticate，头传 null", async () => {
		handler.mockResolvedValue({ kind: "unauthorized" });
		const response = await post(route, "{}", {});
		expect(response.status).toBe(401);
		expect(response.headers.get("www-authenticate")).toBe("Bearer");
		expect(handler).toHaveBeenCalledWith({
			authorizationHeader: null,
			body: {},
		});
	});

	test("invalid-payload → 400，message 原样", async () => {
		const message = "attachments.0.runCaseId: 必须是 uuid";
		handler.mockResolvedValue({ kind: "invalid-payload", message });
		const response = await post(route, "{}");
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "invalid-payload",
			message,
		});
	});

	test("超 4 MiB 直接 413，文案先说清附件本体不走这个端点", async () => {
		const response = await post(route, "{}", {
			"content-length": String(MAX_INGEST_ATTACHMENT_BODY_BYTES + 1),
		});
		expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
		const body = (await response.json()) as { message: string };
		expect(body.message).toContain("附件本体不走这个端点");
		expect(body.message).toContain(advice);
		expect(handler).not.toHaveBeenCalled();
	});

	test("写库故障不被吞掉：500，而不是让 SDK 以为成功了", async () => {
		handler.mockRejectedValue(new Error("connect ECONNREFUSED"));
		const response = await post(route, "{}");
		expect(response.status).toBe(500);
	});
});

test("presign：project-not-found → 404", async () => {
	PRESIGN.handler.mockResolvedValue({ kind: "project-not-found" });
	const response = await post(PRESIGN.route, "{}");
	expect(response.status).toBe(404);
});
