import { describe, expect, it } from "vitest";

import { uploadAttachments } from "./attachment-upload";
import { resolveReporterConfig } from "./config";
import type { FetchLike } from "./http-client";
import { IngestHttpClient } from "./http-client";
import type { LoadedAttachment } from "./reporter-types";

const config = resolveReporterConfig({
	baseUrl: "https://qa.example.com",
	idempotencyKey: "3f2a1b4c-5d6e-4f70-8912-a3b4c5d6e7f8",
	projectId: "11111111-2222-4333-8444-555555555555",
	token: "as_secret",
});

const screenshot: LoadedAttachment = {
	body: new Uint8Array([1, 2, 3]),
	contentType: "image/png",
	fileName: "fail.png",
	kind: "screenshot",
	sizeBytes: 3,
	sourceRef: "PAY-LOGIN-002",
};

interface Recorded {
	method: string;
	url: string;
}

function recorder(responses: unknown[]): {
	calls: Recorded[];
	client: IngestHttpClient;
} {
	const calls: Recorded[] = [];
	const queue = [...responses];
	const fetchImpl: FetchLike = (url, init) => {
		calls.push({ method: String(init.method), url });
		const next = queue.shift();
		if (next instanceof Response) {
			return Promise.resolve(next);
		}
		return Promise.resolve(Response.json(next ?? {}));
	};
	return {
		calls,
		client: new IngestHttpClient({
			baseUrl: config.baseUrl,
			fetchImpl,
			sleep: () => Promise.resolve(),
			token: config.token,
		}),
	};
}

const upload = (index: number, runId: string, runName: string) => ({
	contentType: "image/png",
	index,
	runCaseId: `case-${runId}`,
	runId,
	runName,
	sourceRef: "PAY-LOGIN-002",
	storageKey: `test-runs/p/${runId}/case/screenshot-1.png`,
	uploadUrl: `https://r2.example.com/${runId}?sig=1`,
});

describe("附件三步（§5.6 / D28）", () => {
	it("presign → PUT → register，全程只有 HTTP，没有 S3 SDK", async () => {
		const { calls, client } = recorder([
			{
				expiresInSeconds: 900,
				rejected: [],
				storageConfigured: true,
				uploads: [upload(0, "run-a", "v2.3 回归")],
			},
			new Response(null, { status: 200 }),
			{ registered: [{ index: 0 }], rejected: [], storageConfigured: true },
		]);
		const outcome = await uploadAttachments({
			attachments: [screenshot],
			client,
			config,
		});
		expect(calls.map((call) => call.url)).toEqual([
			"https://qa.example.com/ingest/attachments/presign",
			"https://r2.example.com/run-a?sig=1",
			"https://qa.example.com/ingest/attachments/register",
		]);
		expect(calls[1]?.method).toBe("PUT");
		expect(outcome.uploaded).toBe(1);
		expect(outcome.registered).toBe(1);
	});

	it("一条结果落在两个任务时，同一个文件传两次——这是有意的，不去重", async () => {
		const { calls, client } = recorder([
			{
				expiresInSeconds: 900,
				rejected: [],
				storageConfigured: true,
				uploads: [
					upload(0, "run-a", "v2.3 回归"),
					upload(0, "run-b", "支付模块专项"),
				],
			},
			new Response(null, { status: 200 }),
			new Response(null, { status: 200 }),
			{
				registered: [{ index: 0 }, { index: 1 }],
				rejected: [],
				storageConfigured: true,
			},
		]);
		const outcome = await uploadAttachments({
			attachments: [screenshot],
			client,
			config,
		});
		const puts = calls.filter((call) => call.method === "PUT");
		expect(puts).toHaveLength(2);
		expect(outcome.uploaded).toBe(2);
	});

	it("R2 未配置时降级：逐条拒绝理由原样收下，不抛错", async () => {
		const { client } = recorder([
			{
				expiresInSeconds: 900,
				rejected: [
					{
						index: 0,
						reason: "对象存储未配置，本次附件未受理",
						runName: null,
						sourceRef: "PAY-LOGIN-002",
					},
				],
				storageConfigured: false,
				uploads: [],
			},
		]);
		const outcome = await uploadAttachments({
			attachments: [screenshot],
			client,
			config,
		});
		expect(outcome.storageConfigured).toBe(false);
		expect(outcome.rejections).toEqual([
			"PAY-LOGIN-002：对象存储未配置，本次附件未受理",
		]);
	});

	it("直传失败不拖垮整次上报，只留一条本地失败说明", async () => {
		const { client } = recorder([
			{
				expiresInSeconds: 900,
				rejected: [],
				storageConfigured: true,
				uploads: [upload(0, "run-a", "v2.3 回归")],
			},
			new Response("nope", { status: 403 }),
			new Response("nope", { status: 403 }),
			new Response("nope", { status: 403 }),
		]);
		const outcome = await uploadAttachments({
			attachments: [screenshot],
			client,
			config,
		});
		expect(outcome.uploaded).toBe(0);
		expect(outcome.rejections[0]).toContain("（本地）直传失败");
	});

	it("presign 请求带上与结论同一份 runIds 收窄", async () => {
		const scoped = { ...config, runIds: ["run-a"] };
		let presignBody: unknown;
		const fetchImpl: FetchLike = (_url, init) => {
			presignBody = JSON.parse(String(init.body));
			return Promise.resolve(
				Response.json({
					expiresInSeconds: 900,
					rejected: [],
					storageConfigured: true,
					uploads: [],
				})
			);
		};
		await uploadAttachments({
			attachments: [screenshot],
			client: new IngestHttpClient({
				baseUrl: scoped.baseUrl,
				fetchImpl,
				token: scoped.token,
			}),
			config: scoped,
		});
		expect((presignBody as { runIds: string[] }).runIds).toEqual(["run-a"]);
	});
});
