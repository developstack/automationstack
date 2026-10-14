import { describe, expect, it } from "vitest";

import { uploadAttachments } from "./attachment-upload.js";
import { resolveReporterConfig } from "./config.js";
import type { FetchLike, HttpClientOptions } from "./http-client.js";
import { IngestHttpClient } from "./http-client.js";
import type { LoadedAttachment } from "./reporter-types.js";

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
	body: unknown;
	method: string;
	url: string;
}

/** 按顺序回放 responses，上传 screenshot 一个附件，记下每一次请求。clientOptions 为 {} 时用客户端的默认退避。 */
async function uploadWith(
	responses: unknown[],
	runConfig = config,
	clientOptions: Partial<HttpClientOptions> = { sleep: () => Promise.resolve() }
) {
	const calls: Recorded[] = [];
	const queue = [...responses];
	const fetchImpl: FetchLike = (url, init) => {
		const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
		calls.push({ body, method: String(init.method), url });
		const next = queue.shift();
		if (next instanceof Response) {
			return Promise.resolve(next);
		}
		return Promise.resolve(Response.json(next ?? {}));
	};
	const client = new IngestHttpClient({
		baseUrl: runConfig.baseUrl,
		fetchImpl,
		token: runConfig.token,
		...clientOptions,
	});
	const outcome = await uploadAttachments({
		attachments: [screenshot],
		client,
		config: runConfig,
	});
	return { calls, outcome };
}

const presigned = (...uploads: unknown[]) => ({
	expiresInSeconds: 900,
	rejected: [],
	storageConfigured: true,
	uploads,
});

const putOk = () => new Response(null, { status: 200 });

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
		const { calls, outcome } = await uploadWith([
			presigned(upload(0, "run-a", "v2.3 回归")),
			putOk(),
			{ registered: [{ index: 0 }], rejected: [], storageConfigured: true },
		]);
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
		const { calls, outcome } = await uploadWith([
			presigned(
				upload(0, "run-a", "v2.3 回归"),
				upload(0, "run-b", "支付模块专项")
			),
			putOk(),
			putOk(),
			{
				registered: [{ index: 0 }, { index: 1 }],
				rejected: [],
				storageConfigured: true,
			},
		]);
		expect(calls.filter((call) => call.method === "PUT")).toHaveLength(2);
		expect(outcome.uploaded).toBe(2);
	});

	it("R2 未配置时降级：逐条拒绝理由原样收下，不抛错", async () => {
		const { outcome } = await uploadWith([
			{
				...presigned(),
				rejected: [
					{
						index: 0,
						reason: "对象存储未配置，本次附件未受理",
						runName: null,
						sourceRef: "PAY-LOGIN-002",
					},
				],
				storageConfigured: false,
			},
		]);
		expect(outcome.storageConfigured).toBe(false);
		expect(outcome.rejections).toEqual([
			"PAY-LOGIN-002：对象存储未配置，本次附件未受理",
		]);
	});

	it("直传失败不拖垮整次上报，只留一条本地失败说明", async () => {
		const forbidden = () => new Response("nope", { status: 403 });
		const { outcome } = await uploadWith([
			presigned(upload(0, "run-a", "v2.3 回归")),
			forbidden(),
			forbidden(),
			forbidden(),
		]);
		expect(outcome.uploaded).toBe(0);
		expect(outcome.rejections[0]).toContain("（本地）直传失败");
	});

	it("presign 请求带上与结论同一份 runIds 收窄", async () => {
		const { calls } = await uploadWith(
			[presigned()],
			{ ...config, runIds: ["run-a"] },
			{}
		);
		expect(calls[0]?.body).toMatchObject({ runIds: ["run-a"] });
	});
});
