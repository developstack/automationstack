import {
	buildExecutionRequests,
	MAX_INGEST_COMMENT_LENGTH,
	type ReporterConfig,
	resolveReporterConfig,
} from "@automationstack/sdk";
import { browser, expect } from "@wdio/globals";

import {
	describePresign,
	presignAttachments,
	putPresigned,
	registerAttachments,
} from "../../src/attachment-channel.ts";

function fakeConfig(): ReporterConfig {
	return resolveReporterConfig({
		baseUrl: "https://qa.example.com/",
		env: {},
		idempotencyKey: "0e6ed0a1-4c9c-4f2f-9a1a-2f0e0d1c2b3a",
		projectId: "6a1c0b3e-2d4f-4a58-9c11-7e2d3f4a5b6c",
		token: "placeholder-token",
	});
}

const ONE_PIXEL_PNG = Uint8Array.from(
	Buffer.from(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
		"base64"
	)
);

const HTTP_OK = 200;

describe("ingest 契约与附件通道", () => {
	before(async () => {
		await browser.url("/");
	});

	it("[AUTO-LOGIN-001] 过长的 message 在 SDK 侧就被截断，并留下说明", () => {
		const requests = buildExecutionRequests({
			config: fakeConfig(),
			results: [
				{
					durationMs: 12,
					message: "堆栈".repeat(5000),
					result: "failed",
					sourceRef: "AUTO-LOGIN-001",
				},
			],
			window: { finishedAt: null, startedAt: null },
		});

		const message = requests[0]?.results[0]?.message ?? "";
		expect(message.length).toBeLessThanOrEqual(MAX_INGEST_COMMENT_LENGTH);
		expect(message.endsWith("…（已截断，完整堆栈见 log 附件）")).toBe(true);
	});

	it("[AUTO-CART-002] 失败的截图和日志要一路走到附件行真的存在", async () => {
		const receipt = await presignAttachments([
			{
				contentType: "image/png",
				kind: "screenshot",
				sizeBytes: ONE_PIXEL_PNG.byteLength,
				sourceRef: "AUTO-CART-002",
			},
			{
				contentType: "text/plain",
				kind: "log",
				sizeBytes: 354,
				sourceRef: "AUTO-CART-002",
			},
		]);

		expect(describePresign(receipt)).toEqual(
			"附件通道就绪：2 件全部签出了直传 URL"
		);

		const statuses = await Promise.all(
			receipt.uploads.map((upload) => putPresigned(upload, ONE_PIXEL_PNG))
		);
		expect(statuses).toEqual(receipt.uploads.map(() => HTTP_OK));

		const registered = await registerAttachments(
			receipt.uploads,
			(upload) => `AUTO-CART-002-${upload.index}`
		);
		expect(registered.registered.length).toEqual(receipt.uploads.length);
		const keys = new Set(registered.registered.map((row) => row.storageKey));
		expect(keys.size).toEqual(registered.registered.length);
	});

	// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
	it.skip("[AUTO-PAY-003] 超过一批的结果按 200 条切开", () => {});
});
