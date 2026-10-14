import { describe, expect, test } from "vitest";

import {
	type AttachmentKeyScope,
	attachmentKeyPrefix,
	buildAttachmentStorageKey,
	isAttachmentKeyOwnedBy,
	MAX_ATTACHMENT_BYTES,
	validateAttachmentUpload,
} from "./attachment-policy";

const SCREENSHOT_FILENAME_PATTERN = /^screenshot-[0-9a-f-]{36}\.png$/;

const SCOPE: AttachmentKeyScope = {
	projectId: "11111111-1111-4111-8111-111111111111",
	runCaseId: "33333333-3333-4333-8333-333333333333",
	runId: "22222222-2222-4222-8222-222222222222",
};

const PNG_SCREENSHOT = {
	contentType: "image/png",
	kind: "screenshot",
} as const;

describe("validateAttachmentUpload", () => {
	test.each([
		["screenshot 接受图片", "screenshot", "image/png", "ok"],
		[
			"screenshot 拒绝视频",
			"screenshot",
			"video/mp4",
			"unsupported-content-type",
		],
		["video 接受视频", "video", "video/webm", "ok"],
		["video 拒绝图片", "video", "image/png", "unsupported-content-type"],
		["log 接受纯文本", "log", "text/plain", "ok"],
		["log 拒绝 html", "log", "text/html", "unsupported-content-type"],
		["other 放行三档的并集：图片", "other", "image/webp", "ok"],
		["other 放行三档的并集：视频", "other", "video/mp4", "ok"],
		["other 放行三档的并集：纯文本", "other", "text/plain", "ok"],
		[
			"other 仍然拒绝白名单外的类型",
			"other",
			"application/zip",
			"unsupported-content-type",
		],
	] as const)("%s", (_name, kind, contentType, expected) => {
		expect(
			validateAttachmentUpload({ contentType, kind, sizeBytes: 1024 }).kind
		).toBe(expected);
	});

	test("上限是 20 MiB，边界值本身放行、超一个字节拒绝", () => {
		expect(MAX_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024);
		expect(
			validateAttachmentUpload({
				...PNG_SCREENSHOT,
				sizeBytes: MAX_ATTACHMENT_BYTES,
			}).kind
		).toBe("ok");
		expect(
			validateAttachmentUpload({
				...PNG_SCREENSHOT,
				sizeBytes: MAX_ATTACHMENT_BYTES + 1,
			})
		).toEqual({ kind: "too-large", maxBytes: MAX_ATTACHMENT_BYTES });
	});

	test("类型不合法时优先报类型，而不是体积", () => {
		expect(
			validateAttachmentUpload({
				contentType: "application/zip",
				kind: "screenshot",
				sizeBytes: MAX_ATTACHMENT_BYTES * 10,
			}).kind
		).toBe("unsupported-content-type");
	});
});

describe("buildAttachmentStorageKey", () => {
	test("前缀带齐 项目/测试任务/用例行 三层维度，供排障与批量清理", () => {
		const key = buildAttachmentStorageKey(SCOPE, PNG_SCREENSHOT);
		expect(key.startsWith(attachmentKeyPrefix(SCOPE))).toBe(true);
		expect(attachmentKeyPrefix(SCOPE)).toBe(
			`test-runs/${SCOPE.projectId}/${SCOPE.runId}/${SCOPE.runCaseId}/`
		);
	});

	test.each([
		["image/jpeg", "screenshot", ".jpg"],
		["video/webm", "video", ".webm"],
		["text/plain", "log", ".txt"],
	] as const)(
		"扩展名由 contentType 查表得到：%s → %s",
		(contentType, kind, extension) => {
			expect(
				buildAttachmentStorageKey(SCOPE, { contentType, kind }).endsWith(
					extension
				)
			).toBe(true);
		}
	);

	test("未知 contentType 落到 .bin 而不是把类型串拼进 key", () => {
		const key = buildAttachmentStorageKey(SCOPE, {
			contentType: "application/x-unknown",
			kind: "other",
		});
		expect(key.endsWith(".bin")).toBe(true);
		expect(key).not.toContain("application");
	});

	test("同样的入参每次得到不同的 key（随机段防猜测）", () => {
		const keys = new Set(
			Array.from({ length: 20 }, () =>
				buildAttachmentStorageKey(SCOPE, PNG_SCREENSHOT)
			)
		);
		expect(keys.size).toBe(20);
	});

	test("key 只由已知片段构成，段数固定且没有路径穿越", () => {
		const key = buildAttachmentStorageKey(SCOPE, PNG_SCREENSHOT);
		const segments = key.split("/");
		expect(segments).toHaveLength(5);
		expect(segments.slice(0, 4)).toEqual([
			"test-runs",
			SCOPE.projectId,
			SCOPE.runId,
			SCOPE.runCaseId,
		]);
		expect(key).not.toContain("..");
		expect(segments[4]).toMatch(SCREENSHOT_FILENAME_PATTERN);
	});
});

describe("isAttachmentKeyOwnedBy", () => {
	test("认自己签出去的 key", () => {
		const key = buildAttachmentStorageKey(SCOPE, PNG_SCREENSHOT);
		expect(isAttachmentKeyOwnedBy(key, SCOPE)).toBe(true);
	});

	test("拒绝带 .. 段的 key，即便前缀对得上", () => {
		const key = `${attachmentKeyPrefix(SCOPE)}../../evil.png`;
		expect(key.startsWith(attachmentKeyPrefix(SCOPE))).toBe(true);
		expect(isAttachmentKeyOwnedBy(key, SCOPE)).toBe(false);
	});

	test.each([
		[
			"别的用例行的 key",
			buildAttachmentStorageKey(
				{ ...SCOPE, runCaseId: "44444444-4444-4444-8444-444444444444" },
				PNG_SCREENSHOT
			),
		],
		["空 key", ""],
	])("拒绝%s", (_name, key) => {
		expect(isAttachmentKeyOwnedBy(key, SCOPE)).toBe(false);
	});
});
