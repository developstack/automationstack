import { Hono } from "hono";
import { beforeEach, expect, test, vi } from "vitest";

import { registerIngestAttachmentRoutes } from "./attachment-routes";
import { MAX_INGEST_ATTACHMENT_BODY_BYTES } from "./body-limit";
import { HTTP_PAYLOAD_TOO_LARGE, INVALID_JSON_MESSAGE } from "./responses";

const mocks = vi.hoisted(() => ({
	handleIngestAttachmentPresign: vi.fn(),
	handleIngestAttachmentRegister: vi.fn(),
}));

vi.mock("@automationstack/api/lib/ingest/attachment-uploads", () => mocks);

const AUTHORIZATION = "Bearer as_live_token";
const PRESIGN_ROUTE = "/ingest/attachments/presign";
const REGISTER_ROUTE = "/ingest/attachments/register";

function buildApp(): Hono {
	const app = new Hono();
	registerIngestAttachmentRoutes(app);
	return app;
}

async function post(
	route: string,
	rawBody: string,
	authorized = true
): Promise<Response> {
	return await buildApp().request(route, {
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

test("presign：Authorization 与 parse 后的 body 原样交给 handler", async () => {
	mocks.handleIngestAttachmentPresign.mockResolvedValue({
		kind: "ok",
		receipt: {
			expiresInSeconds: 300,
			rejected: [],
			storageConfigured: true,
			uploads: [],
		},
	});
	await post(
		PRESIGN_ROUTE,
		JSON.stringify({ attachments: [], projectId: "p" })
	);
	expect(mocks.handleIngestAttachmentPresign).toHaveBeenCalledWith({
		authorizationHeader: AUTHORIZATION,
		body: { attachments: [], projectId: "p" },
	});
});

test("presign：body 不是 JSON → 400，handler 一次都没被调用", async () => {
	const response = await post(PRESIGN_ROUTE, "{ 这不是 JSON");
	expect(response.status).toBe(400);
	expect(await response.json()).toEqual({
		error: "invalid-payload",
		message: INVALID_JSON_MESSAGE,
	});
	expect(mocks.handleIngestAttachmentPresign).not.toHaveBeenCalled();
});

test("presign：unauthorized → 401 + WWW-Authenticate，头传 null", async () => {
	mocks.handleIngestAttachmentPresign.mockResolvedValue({
		kind: "unauthorized",
	});
	const response = await post(PRESIGN_ROUTE, "{}", false);
	expect(response.status).toBe(401);
	expect(response.headers.get("www-authenticate")).toBe("Bearer");
	expect(mocks.handleIngestAttachmentPresign).toHaveBeenCalledWith({
		authorizationHeader: null,
		body: {},
	});
});

test("presign：invalid-payload → 400 message 原样；project-not-found → 404", async () => {
	mocks.handleIngestAttachmentPresign.mockResolvedValue({
		kind: "invalid-payload",
		message: "attachments.0.storageKey: 太长了",
	});
	const badPayload = await post(PRESIGN_ROUTE, "{}");
	expect(badPayload.status).toBe(400);
	expect(await badPayload.json()).toEqual({
		error: "invalid-payload",
		message: "attachments.0.storageKey: 太长了",
	});
	mocks.handleIngestAttachmentPresign.mockResolvedValue({
		kind: "project-not-found",
	});
	const missingProject = await post(PRESIGN_ROUTE, "{}");
	expect(missingProject.status).toBe(404);
});

test("presign：R2 未配置是 **200 降级**，逐条 rejected，不是 5xx", async () => {
	const receipt = {
		expiresInSeconds: 300,
		rejected: [
			{ index: 0, reason: "存储未配置", runName: null, sourceRef: "PAY-001" },
		],
		storageConfigured: false,
		uploads: [],
	};
	mocks.handleIngestAttachmentPresign.mockResolvedValue({
		kind: "ok",
		receipt,
	});
	const response = await post(PRESIGN_ROUTE, "{}");
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(receipt);
});

test("presign：超 4 MiB 直接 413，文案先说清附件本体不走这个端点", async () => {
	const response = await buildApp().request(PRESIGN_ROUTE, {
		body: "{}",
		headers: {
			"content-length": String(MAX_INGEST_ATTACHMENT_BODY_BYTES + 1),
		},
		method: "POST",
	});
	expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
	const body = (await response.json()) as { message: string };
	expect(body.message).toContain("附件本体不走这个端点");
	expect(body.message).toContain("请分批申请签名");
	expect(mocks.handleIngestAttachmentPresign).not.toHaveBeenCalled();
});

test("register：ok → 200，对账单原样（registered / rejected 都在）", async () => {
	const receipt = {
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
	};
	mocks.handleIngestAttachmentRegister.mockResolvedValue({
		kind: "ok",
		receipt,
	});
	const response = await post(REGISTER_ROUTE, JSON.stringify({ a: 1 }));
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(receipt);
	expect(mocks.handleIngestAttachmentRegister).toHaveBeenCalledWith({
		authorizationHeader: AUTHORIZATION,
		body: { a: 1 },
	});
});

test("register：unauthorized → 401，invalid JSON → 400，invalid-payload → 400", async () => {
	mocks.handleIngestAttachmentRegister.mockResolvedValue({
		kind: "unauthorized",
	});
	const unauthorized = await post(REGISTER_ROUTE, "{}", false);
	expect(unauthorized.status).toBe(401);
	expect(unauthorized.headers.get("www-authenticate")).toBe("Bearer");

	const badJson = await post(REGISTER_ROUTE, "]");
	expect(badJson.status).toBe(400);
	expect(await badJson.json()).toMatchObject({ message: INVALID_JSON_MESSAGE });

	mocks.handleIngestAttachmentRegister.mockResolvedValue({
		kind: "invalid-payload",
		message: "attachments.0.runCaseId: 必须是 uuid",
	});
	const badPayload = await post(REGISTER_ROUTE, "{}");
	expect(badPayload.status).toBe(400);
	expect(await badPayload.json()).toMatchObject({
		message: "attachments.0.runCaseId: 必须是 uuid",
	});
});

test("register：超 4 MiB 直接 413，文案说的是分批登记", async () => {
	const response = await buildApp().request(REGISTER_ROUTE, {
		body: "{}",
		headers: {
			"content-length": String(MAX_INGEST_ATTACHMENT_BODY_BYTES + 1),
		},
		method: "POST",
	});
	expect(response.status).toBe(HTTP_PAYLOAD_TOO_LARGE);
	const body = (await response.json()) as { message: string };
	expect(body.message).toContain("请分批登记");
	expect(mocks.handleIngestAttachmentRegister).not.toHaveBeenCalled();
});

test("register 的写库故障不被吞掉：500，而不是让 SDK 以为登记成功了", async () => {
	mocks.handleIngestAttachmentRegister.mockRejectedValue(
		new Error("connect ECONNREFUSED")
	);
	const response = await post(REGISTER_ROUTE, "{}");
	expect(response.status).toBe(500);
});
