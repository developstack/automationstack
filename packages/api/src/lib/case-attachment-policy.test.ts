import { describe, expect, test } from "vitest";

import {
	buildCaseAttachmentStorageKey,
	CASE_IMAGE_CONTENT_TYPES,
	type CaseAttachmentKeyScope,
	caseAttachmentKeyPrefix,
	isCaseAttachmentKeyOwnedBy,
	MAX_CASE_IMAGE_BYTES,
	validateCaseImageUpload,
} from "./case-attachment-policy";

const KEY_TAIL_PNG_PATTERN = /^[0-9a-f-]{36}\.png$/;

const WEBP_EXTENSION_PATTERN = /\.webp$/;

const SCOPE: CaseAttachmentKeyScope = {
	caseId: "22222222-2222-4222-8222-222222222222",
	projectId: "11111111-1111-4111-8111-111111111111",
};

describe("validateCaseImageUpload", () => {
	test("接受白名单里的每一种图片", () => {
		for (const contentType of CASE_IMAGE_CONTENT_TYPES) {
			expect(validateCaseImageUpload({ contentType, sizeBytes: 1024 })).toEqual(
				{ kind: "ok" }
			);
		}
	});

	test("拒绝视频：粘贴场景只有图片，正文里的引用只会渲染成 img", () => {
		const result = validateCaseImageUpload({
			contentType: "video/mp4",
			sizeBytes: 1024,
		});

		expect(result.kind).toBe("unsupported-content-type");
	});

	test("拒绝纯文本：白名单不是「除了明显危险的都行」", () => {
		expect(
			validateCaseImageUpload({ contentType: "text/plain", sizeBytes: 10 }).kind
		).toBe("unsupported-content-type");
	});

	test("拒绝 svg：它能带脚本，不是安全的贴图类型", () => {
		expect(
			validateCaseImageUpload({ contentType: "image/svg+xml", sizeBytes: 10 })
				.kind
		).toBe("unsupported-content-type");
	});

	test("拒绝时带上允许的类型，供调用方拼提示文案", () => {
		const result = validateCaseImageUpload({
			contentType: "application/pdf",
			sizeBytes: 10,
		});

		expect(result).toEqual({
			allowedContentTypes: CASE_IMAGE_CONTENT_TYPES,
			kind: "unsupported-content-type",
		});
	});

	test("恰好等于上限时放行，多一个字节就拒绝", () => {
		expect(
			validateCaseImageUpload({
				contentType: "image/png",
				sizeBytes: MAX_CASE_IMAGE_BYTES,
			})
		).toEqual({ kind: "ok" });
		expect(
			validateCaseImageUpload({
				contentType: "image/png",
				sizeBytes: MAX_CASE_IMAGE_BYTES + 1,
			})
		).toEqual({ kind: "too-large", maxBytes: MAX_CASE_IMAGE_BYTES });
	});

	test("类型不合法时先报类型，不被体积盖过", () => {
		expect(
			validateCaseImageUpload({
				contentType: "video/mp4",
				sizeBytes: MAX_CASE_IMAGE_BYTES + 1,
			}).kind
		).toBe("unsupported-content-type");
	});
});

describe("buildCaseAttachmentStorageKey", () => {
	test("形如 test-cases/<projectId>/<caseId>/<uuid>.<ext>", () => {
		const key = buildCaseAttachmentStorageKey(SCOPE, {
			contentType: "image/png",
		});

		expect(key.startsWith(caseAttachmentKeyPrefix(SCOPE))).toBe(true);
		expect(caseAttachmentKeyPrefix(SCOPE)).toBe(
			`test-cases/${SCOPE.projectId}/${SCOPE.caseId}/`
		);
		expect(key.slice(caseAttachmentKeyPrefix(SCOPE).length)).toMatch(
			KEY_TAIL_PNG_PATTERN
		);
	});

	test("扩展名查表得到，jpeg 落成 jpg", () => {
		const key = buildCaseAttachmentStorageKey(SCOPE, {
			contentType: "image/jpeg",
		});

		expect(key.endsWith(".jpg")).toBe(true);
	});

	test("webp 有自己的扩展名，不落回兜底", () => {
		expect(
			buildCaseAttachmentStorageKey(SCOPE, { contentType: "image/webp" })
		).toMatch(WEBP_EXTENSION_PATTERN);
	});

	test("同一条用例连签两次得到不同 key：可预测的 key 会变成探测手段", () => {
		const first = buildCaseAttachmentStorageKey(SCOPE, {
			contentType: "image/png",
		});
		const second = buildCaseAttachmentStorageKey(SCOPE, {
			contentType: "image/png",
		});

		expect(first).not.toBe(second);
	});
});

describe("isCaseAttachmentKeyOwnedBy", () => {
	test("认自己前缀下的 key", () => {
		const key = buildCaseAttachmentStorageKey(SCOPE, {
			contentType: "image/png",
		});

		expect(isCaseAttachmentKeyOwnedBy(key, SCOPE)).toBe(true);
	});

	test("拒绝别的用例的 key（形状合法，只是不属于调用者）", () => {
		const foreign = buildCaseAttachmentStorageKey(
			{
				caseId: "33333333-3333-4333-8333-333333333333",
				projectId: SCOPE.projectId,
			},
			{ contentType: "image/png" }
		);

		expect(isCaseAttachmentKeyOwnedBy(foreign, SCOPE)).toBe(false);
	});

	test("拒绝别的项目的 key", () => {
		const foreign = buildCaseAttachmentStorageKey(
			{
				caseId: SCOPE.caseId,
				projectId: "44444444-4444-4444-8444-444444444444",
			},
			{ contentType: "image/png" }
		);

		expect(isCaseAttachmentKeyOwnedBy(foreign, SCOPE)).toBe(false);
	});

	test("拒绝测试任务附件的 key：两条链路的对象互不通用", () => {
		const runKey = `test-runs/${SCOPE.projectId}/r/rc/screenshot-x.png`;

		expect(isCaseAttachmentKeyOwnedBy(runKey, SCOPE)).toBe(false);
	});

	test("拒绝含 .. 段的 key，即使它落在前缀下", () => {
		const sneaky = `${caseAttachmentKeyPrefix(SCOPE)}../evil.png`;

		expect(isCaseAttachmentKeyOwnedBy(sneaky, SCOPE)).toBe(false);
	});

	test("前缀只差一个字符也拒绝（不是 startsWith 就完事）", () => {
		const almost = `test-cases/${SCOPE.projectId}/${SCOPE.caseId}x/a.png`;

		expect(isCaseAttachmentKeyOwnedBy(almost, SCOPE)).toBe(false);
	});
});
