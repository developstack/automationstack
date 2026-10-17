import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { describe, expect, it } from "vitest";

import { signScreenshotUploadToken } from "./case-screenshot-upload-token";
import {
	resolveStepScreenshotUploads,
	type ScreenshotUploadContext,
} from "./case-screenshot-uploads";
import { createStore, VALID_HEAD } from "./object-store-fixtures";

const SECRET = "test-session-secret-0123456789abcdef";
const NOW = Date.parse("2026-10-18T08:00:00Z");
const HOUR_MS = 3_600_000;
const PROJECT = "55555555-5555-4555-8555-555555555555";
const CASE = "44444444-4444-4444-8444-444444444444";
const OTHER_CASE = "44444444-4444-4444-8444-000000000000";
const USER = "11111111-1111-4111-8111-111111111111";

const attachmentId = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const keyOf = (n: number, caseId = CASE) =>
	`test-cases/${PROJECT}/${caseId}/${n}.png`;

/** 第 n 次上传的凭证。默认属于 CASE，现在签发。 */
function token(
	n: number,
	options: {
		caseId?: string;
		now?: number;
		projectId?: string;
		storageKey?: string;
	} = {}
): Promise<string> {
	const caseId = options.caseId ?? CASE;
	return signScreenshotUploadToken(
		{
			attachmentId: attachmentId(n),
			caseId,
			fileName: `${n}.png`,
			projectId: options.projectId ?? PROJECT,
			storageKey: options.storageKey ?? keyOf(n, caseId),
		},
		{ now: options.now ?? NOW, secret: SECRET }
	);
}

const step = (id: string, groups: Partial<CaseStep> = {}): CaseStep => ({
	expected: "",
	id,
	step: "",
	...groups,
});

function context(
	overrides: Partial<ScreenshotUploadContext> = {}
): ScreenshotUploadContext {
	return {
		createdBy: USER,
		now: NOW,
		projectId: PROJECT,
		secret: SECRET,
		storage: createStore(),
		...overrides,
	};
}

describe("resolveStepScreenshotUploads：把截图中的上传凭证换成用例附件", () => {
	it.each([
		["no screenshot fields", [step("s1")]],
		[
			"only empty groups",
			[step("s1", { actionScreenshots: [], expectedScreenshots: [] })],
		],
	])("does nothing for %s", async (_name, steps) => {
		const storage = createStore();
		expect(
			await resolveStepScreenshotUploads(steps, context({ storage }))
		).toEqual({ kind: "none" });
		expect(storage.calls).toEqual([]);
	});

	it("replaces each token with its attachment id, keeps the order and registers each upload once", async () => {
		const [one, two] = await Promise.all([token(1), token(2)]);
		const storage = createStore();
		const result = await resolveStepScreenshotUploads(
			[
				step("s1", { actionScreenshots: [two, one] }),
				step("s2", { expectedScreenshots: [one] }),
				step("s3"),
			],
			context({ storage })
		);
		expect(result).toEqual({
			attachments: [2, 1].map((n) => ({
				contentType: VALID_HEAD.contentType,
				createdBy: USER,
				fileName: `${n}.png`,
				id: attachmentId(n),
				sizeBytes: VALID_HEAD.contentLength,
				storageKey: keyOf(n),
			})),
			caseId: CASE,
			kind: "ok",
			steps: [
				step("s1", { actionScreenshots: [attachmentId(2), attachmentId(1)] }),
				step("s2", { expectedScreenshots: [attachmentId(1)] }),
				step("s3"),
			],
		});
		expect(storage.calls).toEqual([
			`headObject:${keyOf(2)}`,
			`headObject:${keyOf(1)}`,
		]);
	});

	it.each<
		[string, () => Promise<string>, Partial<ScreenshotUploadContext>, string]
	>([
		[
			"a value that is not a token",
			() => Promise.resolve(attachmentId(1)),
			{},
			"步骤 s1 的预期截图：截图上传凭证无效，请使用取得上传地址时返回的 uploadToken",
		],
		[
			"an expired token",
			() => token(1, { now: NOW - HOUR_MS - 1 }),
			{},
			"步骤 s1 的预期截图：截图上传凭证已过期（签发后 1 小时内有效），请重新取得上传地址并上传",
		],
		[
			"a token of another project",
			() => token(1, { projectId: CASE }),
			{},
			"步骤 s1 的预期截图：截图上传凭证属于另一个项目",
		],
		[
			"a token whose object is not under the case",
			() => token(1, { storageKey: keyOf(1, OTHER_CASE) }),
			{},
			"步骤 s1 的预期截图：storageKey 不属于该用例",
		],
		[
			"a file that was never uploaded",
			() => token(1),
			{ storage: createStore(null) },
			"步骤 s1 的预期截图：截图文件不存在：上传没有完成，或上传地址已过期。请重新取得上传地址并上传",
		],
		[
			"an uploaded file of a type that is not allowed",
			() => token(1),
			{ storage: createStore({ contentLength: 1, contentType: "image/gif" }) },
			"步骤 s1 的预期截图：用例贴图不支持实际上传的 image/gif，允许的类型：image/png, image/jpeg, image/webp",
		],
		[
			"an uploaded file larger than 10 MB",
			() => token(1),
			{
				storage: createStore({
					contentLength: 10 * 1024 * 1024 + 1,
					contentType: "image/png",
				}),
			},
			"步骤 s1 的预期截图：实际上传的图片 10485761 字节，超过上限 10485760 字节",
		],
		[
			"no object storage",
			() => token(1),
			{ storage: null },
			"附件存储（R2）未配置，无法写入操作截图或预期截图",
		],
	])("rejects %s", async (_name, makeToken, overrides, message) => {
		const result = await resolveStepScreenshotUploads(
			[step("s1", { expectedScreenshots: [await makeToken()] })],
			context(overrides)
		);
		expect(result).toEqual({ kind: "error", message });
	});

	it("rejects uploads of two different cases in one case", async () => {
		const [own, other] = await Promise.all([
			token(1),
			token(2, { caseId: OTHER_CASE }),
		]);
		expect(
			await resolveStepScreenshotUploads(
				[
					step("s1", { actionScreenshots: [own] }),
					step("s2", { actionScreenshots: [other] }),
				],
				context()
			)
		).toEqual({
			kind: "error",
			message: "步骤 s2 的操作截图：一条用例的截图上传凭证必须属于同一个用例",
		});
	});

	it("rejects more than 50 uploads in one case with a clear message", async () => {
		const tokens = await Promise.all(
			Array.from({ length: 51 }, (_, n) => token(n))
		);
		const steps = Array.from({ length: 6 }, (_, index) =>
			step(`s${index}`, {
				actionScreenshots: tokens.slice(index * 9, index * 9 + 9),
			})
		);
		expect(await resolveStepScreenshotUploads(steps, context())).toEqual({
			kind: "error",
			message:
				"一条用例一次最多引用 50 个截图上传凭证，这一行有 51 个。请分几次写入：已经写入的步骤不给截图字段，截图保持不变",
		});
	});
});
