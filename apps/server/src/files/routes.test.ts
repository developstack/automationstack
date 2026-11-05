import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalStorage } from "@automationstack/api/lib/local-storage";
import { runWithRequestOrigin } from "@automationstack/api/lib/request-origin";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerFileRoutes } from "./routes";

const mocks = vi.hoisted(() => ({
	env: {
		FILE_STORAGE_ACCEL_PREFIX: undefined as string | undefined,
		FILE_STORAGE_DIR: "",
		SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789",
	},
}));

vi.mock("@automationstack/env/server", () => ({ env: mocks.env }));

const ORIGIN = "http://files.test";
const IMAGE_KEY = "test-cases/p/c/1b4e28ba-2fa1-11d2-883f-0016d3cca427.png";
const BODY = "0123456789";
const PRIVATE_CACHE = /^private, max-age=\d+$/;

const app = new Hono();
registerFileRoutes(app);

beforeEach(async () => {
	mocks.env.FILE_STORAGE_DIR = await mkdtemp(path.join(tmpdir(), "files-"));
	mocks.env.FILE_STORAGE_ACCEL_PREFIX = undefined;
});

afterEach(async () => {
	await rm(mocks.env.FILE_STORAGE_DIR, { force: true, recursive: true });
});

function sign<T>(
	run: (storage: ReturnType<typeof createLocalStorage>) => Promise<T>
) {
	return runWithRequestOrigin(ORIGIN, () =>
		run(createLocalStorage(mocks.env.FILE_STORAGE_DIR))
	);
}

function put(url: string, body: string, contentType = "image/png") {
	return app.request(url, {
		body,
		headers: { "Content-Type": contentType },
		method: "PUT",
	});
}

async function upload(key = IMAGE_KEY): Promise<void> {
	const url = await sign((storage) =>
		storage.presignUpload(key, {
			contentLength: BODY.length,
			contentType: "image/png",
		})
	);
	expect((await put(url, BODY)).status).toBe(200);
}

describe("PUT /files/*：只接受签发的类型和准确的大小", () => {
	it("stores the file, and a download link returns it with safe headers", async () => {
		await upload();
		const response = await app.request(
			await sign((storage) => storage.caseImageUrl(IMAGE_KEY))
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe(BODY);
		expect(Object.fromEntries(response.headers)).toMatchObject({
			"cache-control": "public, max-age=31536000, immutable",
			"content-type": "image/png",
			"x-content-type-options": "nosniff",
		});
	});

	it.each([
		["another type", BODY, { "Content-Type": "image/jpeg" }, 403],
		[
			"another Content-Length",
			BODY,
			{ "Content-Length": "9", "Content-Type": "image/png" },
			403,
		],
		[
			"a shorter body without Content-Length",
			"012345678",
			{ "Content-Type": "image/png" },
			400,
		],
		[
			"a longer body without Content-Length",
			`${BODY}0`,
			{ "Content-Type": "image/png" },
			400,
		],
	])("refuses %s", async (_name, body, headers, status) => {
		const url = await sign((storage) =>
			storage.presignUpload(IMAGE_KEY, {
				contentLength: BODY.length,
				contentType: "image/png",
			})
		);
		const response = await app.request(url, { body, headers, method: "PUT" });
		expect(response.status).toBe(status);
		const second = await app.request(
			await sign((storage) => storage.caseImageUrl(IMAGE_KEY))
		);
		expect(second.status).toBe(404);
	});

	it("refuses a changed signature and an unsafe path", async () => {
		const url = new URL(
			await sign((storage) =>
				storage.presignUpload(IMAGE_KEY, {
					contentLength: BODY.length,
					contentType: "image/png",
				})
			)
		);
		url.searchParams.set("size", "11");
		expect((await put(url.toString(), `${BODY}0`)).status).toBe(403);
		expect((await put(`${ORIGIN}/files/..%2Fx.png`, BODY)).status).toBe(404);
	});
});

describe("GET /files/*", () => {
	it("refuses a link without a valid signature, and returns 404 for a missing file", async () => {
		await upload();
		expect((await app.request(`${ORIGIN}/files/${IMAGE_KEY}`)).status).toBe(
			403
		);
		const missing = "test-cases/p/c/missing.png";
		const response = await app.request(
			await sign((storage) => storage.caseImageUrl(missing))
		);
		expect(response.status).toBe(404);
	});

	it.each([
		["bytes=2-5", 206, "2345", "bytes 2-5/10"],
		["bytes=-3", 206, "789", "bytes 7-9/10"],
		["bytes=8-", 206, "89", "bytes 8-9/10"],
		["bytes=20-", 416, "", "bytes */10"],
	])("Range %s gives %i", async (range, status, body, contentRange) => {
		await upload();
		const url = await sign((storage) => storage.presignDownload(IMAGE_KEY));
		const response = await app.request(url, { headers: { Range: range } });
		expect(response.status).toBe(status);
		expect(await response.text()).toBe(body);
		expect(response.headers.get("content-range")).toBe(contentRange);
	});

	it("behind nginx: answers with X-Accel-Redirect and no body", async () => {
		mocks.env.FILE_STORAGE_ACCEL_PREFIX = "/_files/";
		await upload();
		const response = await app.request(
			await sign((storage) => storage.presignDownload(IMAGE_KEY))
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("x-accel-redirect")).toBe(
			`/_files/${IMAGE_KEY}`
		);
		expect(response.headers.get("cache-control")).toMatch(PRIVATE_CACHE);
		expect(await response.text()).toBe("");
	});
});
