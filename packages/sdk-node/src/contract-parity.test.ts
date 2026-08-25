import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
	MAX_INGEST_ATTACHMENTS_PER_REQUEST as API_MAX_ATTACHMENTS,
	ingestAttachmentPresignReceiptSchema,
	ingestAttachmentPresignRequestSchema,
	ingestAttachmentRegisterRequestSchema,
} from "@automationstack/api/lib/ingest/attachment-contract";
import {
	MAX_INGEST_COMMENT_LENGTH as API_MAX_COMMENT,
	MAX_INGEST_MESSAGE_LENGTH as API_MAX_MESSAGE,
	MAX_INGEST_RESULTS_PER_REQUEST as API_MAX_RESULTS,
	MAX_INGEST_SOURCE_REF_LENGTH as API_MAX_SOURCE_REF,
	type IngestExecutionRequestWire as ApiExecutionRequestWire,
	ingestExecutionReceiptSchema,
	ingestExecutionRequestSchema,
} from "@automationstack/api/lib/ingest/execution-contract";
import { describe, expect, it } from "vitest";

import { resolveReporterConfig } from "./config";
import {
	MAX_INGEST_ATTACHMENTS_PER_REQUEST,
	MAX_INGEST_COMMENT_LENGTH,
	MAX_INGEST_MESSAGE_LENGTH,
	MAX_INGEST_RESULTS_PER_REQUEST,
	MAX_INGEST_SOURCE_REF_LENGTH,
} from "./contract-limits";
import type {
	IngestAttachmentPresignReceipt,
	IngestExecutionReceipt,
	IngestExecutionRequestWire,
} from "./contract-types";
import { buildExecutionRequests } from "./execution-batches";
import {
	INGEST_ATTACHMENTS_PRESIGN_ROUTE,
	INGEST_ATTACHMENTS_REGISTER_ROUTE,
	INGEST_EXECUTIONS_ROUTE,
	INGEST_RUNS_ROUTE,
} from "./route-paths";

/**
 * 契约副本的一致性兜底。
 *
 * 本包**自带一份契约副本**（理由见 `contract-types.ts` 顶部：发到 npm 的包不能
 * 在类型里引用一个私有包）。副本的唯一风险是分叉，这个文件就是那道闸：
 * 它把服务端那份 zod schema 真的 import 进来，用**真 schema**去 parse SDK
 * 造出来的请求体，再逐个比对数值上限与四条 URL。改了服务端而没改这里，测试立刻红。
 *
 * ⚠️ `@automationstack/api` 只在 `devDependencies` 里，**运行时依赖是零**。
 * 它那条 import 链（`execution-contract.ts` 刻意只 import zod）碰不到
 * `@automationstack/db`，所以这个测试不需要 `DATABASE_URL`。
 *
 * W6（pytest）与 W7（JUnit）照同一条路子：各自带一份契约副本 + 一个一致性测试。
 * 那两家没法 import TypeScript，比对对象换成 OpenAPI 文档，但闸门的位置一样。
 */

const SERVER_ROUTE_PATHS = fileURLToPath(
	new URL("../../../apps/server/src/ingest/route-paths.ts", import.meta.url)
);

const config = resolveReporterConfig({
	baseUrl: "https://qa.example.com",
	idempotencyKey: "3f2a1b4c-5d6e-4f70-8912-a3b4c5d6e7f8",
	projectId: "11111111-2222-4333-8444-555555555555",
	token: "as_secret",
});

/** 编译期的那一半：SDK 的线上类型必须能原样当作服务端的输入类型用。 */
const asApiRequest = (
	request: IngestExecutionRequestWire
): ApiExecutionRequestWire => request;

describe("契约副本与服务端一致", () => {
	it("SDK 造出来的请求体过得了服务端真正的 zod schema", () => {
		const [request] = buildExecutionRequests({
			config,
			results: [
				{ durationMs: 1820, result: "passed", sourceRef: "PAY-LOGIN-001" },
				{
					message: "expected 200, got 500",
					result: "failed",
					sourceRef: "PAY-LOGIN-002",
				},
			],
			window: {
				finishedAt: new Date("2026-08-25T06:14:22.000Z"),
				startedAt: new Date("2026-08-25T06:00:00.000Z"),
			},
		});
		expect(request).toBeDefined();
		if (!request) {
			return;
		}
		const parsed = ingestExecutionRequestSchema.parse(asApiRequest(request));
		expect(parsed.results).toHaveLength(2);
		expect(parsed.runIds).toBeNull();
	});

	it("SDK 认得的对账单形状就是服务端定义的那个", () => {
		const receipt: IngestExecutionReceipt = {
			executionId: "22222222-3333-4444-8555-666666666666",
			outOfScope: [
				{
					caseId: "44444444-5555-4666-8777-888888888888",
					reason: "不在任何未提交任务的范围内",
					runName: null,
					sourceRef: "PAY-CART-031",
				},
			],
			skippedManual: [
				{
					reason: "已有人工结论",
					runName: "v2.3 回归",
					sourceRef: "PAY-CART-007",
				},
			],
			unmatchedCases: [
				{ reason: "项目里没有这个 sourceRef 的用例", sourceRef: "PAY-NEW-099" },
			],
			writtenTo: [
				{
					runId: "33333333-4444-4555-8666-777777777777",
					runName: "v2.3 回归",
					updated: 78,
				},
			],
		};
		expect(() => ingestExecutionReceiptSchema.parse(receipt)).not.toThrow();
	});

	it("附件两步的请求体与对账单形状也对得上", () => {
		expect(() =>
			ingestAttachmentPresignRequestSchema.parse({
				attachments: [
					{
						contentType: "image/png",
						kind: "screenshot",
						sizeBytes: 3,
						sourceRef: "PAY-LOGIN-002",
					},
				],
				projectId: config.projectId,
				runIds: null,
			})
		).not.toThrow();
		expect(() =>
			ingestAttachmentRegisterRequestSchema.parse({
				attachments: [
					{
						fileName: "fail.png",
						kind: "screenshot",
						runCaseId: "44444444-5555-4666-8777-888888888888",
						runId: "33333333-4444-4555-8666-777777777777",
						storageKey: "test-runs/p/r/c/screenshot-1.png",
					},
				],
			})
		).not.toThrow();
		const receipt: IngestAttachmentPresignReceipt = {
			expiresInSeconds: 900,
			rejected: [],
			storageConfigured: false,
			uploads: [],
		};
		expect(() =>
			ingestAttachmentPresignReceiptSchema.parse(receipt)
		).not.toThrow();
	});

	it("数值上限逐个对齐", () => {
		expect(MAX_INGEST_RESULTS_PER_REQUEST).toBe(API_MAX_RESULTS);
		expect(MAX_INGEST_ATTACHMENTS_PER_REQUEST).toBe(API_MAX_ATTACHMENTS);
		expect(MAX_INGEST_COMMENT_LENGTH).toBe(API_MAX_COMMENT);
		expect(MAX_INGEST_MESSAGE_LENGTH).toBe(API_MAX_MESSAGE);
		expect(MAX_INGEST_SOURCE_REF_LENGTH).toBe(API_MAX_SOURCE_REF);
	});

	it("四条 URL 与服务端那份逐字一致", () => {
		// 路径常量在 `apps/server` 里，那不是一个能被本包 import 的地方
		// （它是应用不是库），所以当文本读进来比。比不上就说明有一边改了。
		const source = readFileSync(SERVER_ROUTE_PATHS, "utf8");
		const declared = [...source.matchAll(/export const (\w+) = "([^"]+)";/g)];
		expect(declared.length).toBeGreaterThan(0);
		const serverPaths = Object.fromEntries(
			declared.map((match) => [match[1], match[2]])
		);
		expect(serverPaths).toEqual({
			INGEST_ATTACHMENTS_PRESIGN_ROUTE,
			INGEST_ATTACHMENTS_REGISTER_ROUTE,
			INGEST_EXECUTIONS_ROUTE,
			INGEST_RUNS_ROUTE,
		});
	});
});
