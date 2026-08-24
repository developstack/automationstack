import { describe, expect, test } from "vitest";

import {
	type AttachmentKeyScope,
	attachmentKeyPrefix,
	buildAttachmentStorageKey,
	isAttachmentKeyOwnedBy,
	MAX_ATTACHMENT_BYTES,
	validateAttachmentUpload,
} from "./attachment-policy";

/**
 * key 末段的形状：`<kind>-<uuid>.<ext>`。提到顶层是 Biome 的
 * `useTopLevelRegex` 要求——正则字面量写在函数里每次调用都会重新编译。
 */
const SCREENSHOT_FILENAME_PATTERN = /^screenshot-[0-9a-f-]{36}\.png$/;

const SCOPE: AttachmentKeyScope = {
	projectId: "11111111-1111-4111-8111-111111111111",
	runCaseId: "33333333-3333-4333-8333-333333333333",
	runId: "22222222-2222-4222-8222-222222222222",
};

describe("validateAttachmentUpload", () => {
	test("screenshot 接受图片、拒绝视频", () => {
		expect(
			validateAttachmentUpload({
				contentType: "image/png",
				kind: "screenshot",
				sizeBytes: 1024,
			})
		).toEqual({ kind: "ok" });

		const rejected = validateAttachmentUpload({
			contentType: "video/mp4",
			kind: "screenshot",
			sizeBytes: 1024,
		});
		expect(rejected.kind).toBe("unsupported-content-type");
	});

	test("video 只接受视频，log 只接受纯文本", () => {
		expect(
			validateAttachmentUpload({
				contentType: "video/webm",
				kind: "video",
				sizeBytes: 1024,
			}).kind
		).toBe("ok");
		expect(
			validateAttachmentUpload({
				contentType: "image/png",
				kind: "video",
				sizeBytes: 1024,
			}).kind
		).toBe("unsupported-content-type");
		expect(
			validateAttachmentUpload({
				contentType: "text/plain",
				kind: "log",
				sizeBytes: 1024,
			}).kind
		).toBe("ok");
		expect(
			validateAttachmentUpload({
				contentType: "text/html",
				kind: "log",
				sizeBytes: 1024,
			}).kind
		).toBe("unsupported-content-type");
	});

	/** `other` 是兜底档，不是「任意类型」的后门。 */
	test("other 放行三档的并集，但仍然拒绝白名单外的类型", () => {
		for (const contentType of [
			"image/webp",
			"video/mp4",
			"text/plain",
		] as const) {
			expect(
				validateAttachmentUpload({ contentType, kind: "other", sizeBytes: 1 })
					.kind
			).toBe("ok");
		}
		expect(
			validateAttachmentUpload({
				contentType: "application/zip",
				kind: "other",
				sizeBytes: 1,
			}).kind
		).toBe("unsupported-content-type");
	});

	test("上限是 20 MiB，边界值本身放行、超一个字节拒绝", () => {
		expect(MAX_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024);
		expect(
			validateAttachmentUpload({
				contentType: "image/png",
				kind: "screenshot",
				sizeBytes: MAX_ATTACHMENT_BYTES,
			}).kind
		).toBe("ok");
		expect(
			validateAttachmentUpload({
				contentType: "image/png",
				kind: "screenshot",
				sizeBytes: MAX_ATTACHMENT_BYTES + 1,
			})
		).toEqual({ kind: "too-large", maxBytes: MAX_ATTACHMENT_BYTES });
	});

	/**
	 * 类型先于大小判定：一个 500MB 的 zip 应该被告知「类型不支持」，
	 * 因为改小它也传不上来，提示改大小是把用户往错路上带。
	 */
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
		const key = buildAttachmentStorageKey(SCOPE, {
			contentType: "image/png",
			kind: "screenshot",
		});
		expect(key.startsWith(attachmentKeyPrefix(SCOPE))).toBe(true);
		expect(attachmentKeyPrefix(SCOPE)).toBe(
			`test-runs/${SCOPE.projectId}/${SCOPE.runId}/${SCOPE.runCaseId}/`
		);
	});

	test("扩展名由 contentType 查表得到", () => {
		expect(
			buildAttachmentStorageKey(SCOPE, {
				contentType: "image/jpeg",
				kind: "screenshot",
			}).endsWith(".jpg")
		).toBe(true);
		expect(
			buildAttachmentStorageKey(SCOPE, {
				contentType: "video/webm",
				kind: "video",
			}).endsWith(".webm")
		).toBe(true);
		expect(
			buildAttachmentStorageKey(SCOPE, {
				contentType: "text/plain",
				kind: "log",
			}).endsWith(".txt")
		).toBe(true);
	});

	/** 白名单挡在前面，走不到这里；仍然要保证兜底不是空扩展名或崩溃。 */
	test("未知 contentType 落到 .bin 而不是把类型串拼进 key", () => {
		const key = buildAttachmentStorageKey(SCOPE, {
			contentType: "application/x-unknown",
			kind: "other",
		});
		expect(key.endsWith(".bin")).toBe(true);
		expect(key).not.toContain("application");
	});

	test("同样的入参每次得到不同的 key（随机段防猜测）", () => {
		const attachment = {
			contentType: "image/png",
			kind: "screenshot",
		} as const;
		const keys = new Set(
			Array.from({ length: 20 }, () =>
				buildAttachmentStorageKey(SCOPE, attachment)
			)
		);
		expect(keys.size).toBe(20);
	});

	/**
	 * key 里绝不能出现用户原始文件名——路径穿越与中文/特殊字符的签名问题
	 * 都从那里来。这里断言的是「key 的每一段都只由 id、kind、uuid、扩展名构成」。
	 */
	test("key 只由已知片段构成，段数固定且没有路径穿越", () => {
		const key = buildAttachmentStorageKey(SCOPE, {
			contentType: "image/png",
			kind: "screenshot",
		});
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
	const OTHER_CASE: AttachmentKeyScope = {
		...SCOPE,
		runCaseId: "44444444-4444-4444-8444-444444444444",
	};

	test("认自己签出去的 key", () => {
		const key = buildAttachmentStorageKey(SCOPE, {
			contentType: "image/png",
			kind: "screenshot",
		});
		expect(isAttachmentKeyOwnedBy(key, SCOPE)).toBe(true);
	});

	test("拒绝别的用例行的 key", () => {
		const key = buildAttachmentStorageKey(OTHER_CASE, {
			contentType: "image/png",
			kind: "screenshot",
		});
		expect(isAttachmentKeyOwnedBy(key, SCOPE)).toBe(false);
	});

	test("拒绝带 .. 段的 key，即便前缀对得上", () => {
		const key = `${attachmentKeyPrefix(SCOPE)}../../evil.png`;
		expect(key.startsWith(attachmentKeyPrefix(SCOPE))).toBe(true);
		expect(isAttachmentKeyOwnedBy(key, SCOPE)).toBe(false);
	});

	test("拒绝空 key", () => {
		expect(isAttachmentKeyOwnedBy("", SCOPE)).toBe(false);
	});
});
