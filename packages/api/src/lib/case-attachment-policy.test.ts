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

const SCOPE: CaseAttachmentKeyScope = {
	caseId: "22222222-2222-4222-8222-222222222222",
	projectId: "11111111-1111-4111-8111-111111111111",
};

const keyFor = (scope: CaseAttachmentKeyScope, contentType = "image/png") =>
	buildCaseAttachmentStorageKey(scope, { contentType });

describe("validateCaseImageUpload", () => {
	test("接受白名单里的每一种图片", () => {
		for (const contentType of CASE_IMAGE_CONTENT_TYPES) {
			expect(validateCaseImageUpload({ contentType, sizeBytes: 1024 })).toEqual(
				{ kind: "ok" }
			);
		}
	});

	test.each([
		["视频：粘贴场景只有图片，正文里的引用只会渲染成 img", "video/mp4", 1024],
		["纯文本：白名单不是「除了明显危险的都行」", "text/plain", 10],
		["svg：它能带脚本，不是安全的贴图类型", "image/svg+xml", 10],
		["pdf", "application/pdf", 10],
		[
			"类型不合法又超限：先报类型，不被体积盖过",
			"video/mp4",
			MAX_CASE_IMAGE_BYTES + 1,
		],
	])(
		"拒绝%s；拒绝时带上允许的类型，供调用方拼提示文案",
		(_name, contentType, sizeBytes) => {
			expect(validateCaseImageUpload({ contentType, sizeBytes })).toEqual({
				allowedContentTypes: CASE_IMAGE_CONTENT_TYPES,
				kind: "unsupported-content-type",
			});
		}
	);

	test("恰好等于上限时放行，多一个字节就拒绝", () => {
		const png = (sizeBytes: number) =>
			validateCaseImageUpload({ contentType: "image/png", sizeBytes });
		expect(png(MAX_CASE_IMAGE_BYTES)).toEqual({ kind: "ok" });
		expect(png(MAX_CASE_IMAGE_BYTES + 1)).toEqual({
			kind: "too-large",
			maxBytes: MAX_CASE_IMAGE_BYTES,
		});
	});
});

describe("buildCaseAttachmentStorageKey", () => {
	test("形如 test-cases/<projectId>/<caseId>/<uuid>.<ext>", () => {
		const key = keyFor(SCOPE);
		expect(key.startsWith(caseAttachmentKeyPrefix(SCOPE))).toBe(true);
		expect(caseAttachmentKeyPrefix(SCOPE)).toBe(
			`test-cases/${SCOPE.projectId}/${SCOPE.caseId}/`
		);
		expect(key.slice(caseAttachmentKeyPrefix(SCOPE).length)).toMatch(
			KEY_TAIL_PNG_PATTERN
		);
	});

	test.each([
		["jpeg 落成 jpg", "image/jpeg", ".jpg"],
		["webp 有自己的扩展名，不落回兜底", "image/webp", ".webp"],
	])("扩展名查表得到：%s", (_name, contentType, extension) => {
		expect(keyFor(SCOPE, contentType).endsWith(extension)).toBe(true);
	});

	test("同一条用例连签两次得到不同 key：可预测的 key 会变成探测手段", () => {
		expect(keyFor(SCOPE)).not.toBe(keyFor(SCOPE));
	});
});

describe("isCaseAttachmentKeyOwnedBy", () => {
	test("认自己前缀下的 key", () => {
		expect(isCaseAttachmentKeyOwnedBy(keyFor(SCOPE), SCOPE)).toBe(true);
	});

	test.each([
		[
			"别的用例的 key（形状合法，只是不属于调用者）",
			keyFor({ ...SCOPE, caseId: "33333333-3333-4333-8333-333333333333" }),
		],
		[
			"别的项目的 key",
			keyFor({ ...SCOPE, projectId: "44444444-4444-4444-8444-444444444444" }),
		],
		[
			"测试任务附件的 key：两条链路的对象互不通用",
			`test-runs/${SCOPE.projectId}/r/rc/screenshot-x.png`,
		],
		[
			"含 .. 段的 key，即使它落在前缀下",
			`${caseAttachmentKeyPrefix(SCOPE)}../evil.png`,
		],
		[
			"前缀只差一个字符的 key（不是 startsWith 就完事）",
			`test-cases/${SCOPE.projectId}/${SCOPE.caseId}x/a.png`,
		],
	])("拒绝%s", (_name, key) => {
		expect(isCaseAttachmentKeyOwnedBy(key, SCOPE)).toBe(false);
	});
});
