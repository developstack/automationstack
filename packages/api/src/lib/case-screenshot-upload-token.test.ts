import { describe, expect, it } from "vitest";

import { signJson } from "../auth/hmac";
import {
	readScreenshotUploadToken,
	SCREENSHOT_UPLOAD_TOKEN_TTL_SECONDS,
	type ScreenshotUpload,
	signScreenshotUploadToken,
} from "./case-screenshot-upload-token";

const SECRET = "test-session-secret-0123456789abcdef";
const NOW = Date.parse("2026-10-18T08:00:00Z");
const TTL_MS = SCREENSHOT_UPLOAD_TOKEN_TTL_SECONDS * 1000;

const UPLOAD: ScreenshotUpload = {
	attachmentId: "00000000-0000-4000-8000-0000000000a1",
	caseId: "44444444-4444-4444-8444-444444444444",
	fileName: "登录页.png",
	projectId: "55555555-5555-4555-8555-555555555555",
	storageKey:
		"test-cases/55555555-5555-4555-8555-555555555555/44444444-4444-4444-8444-444444444444/k.png",
};

const sign = () =>
	signScreenshotUploadToken(UPLOAD, { now: NOW, secret: SECRET });

describe("截图上传凭证：签名后只能用于这一个上传，过期后不能再用", () => {
	it.each([
		["at once", NOW],
		["just before it expires", NOW + TTL_MS],
	])("reads back the upload %s", async (_name, now) => {
		expect(
			await readScreenshotUploadToken(await sign(), { now, secret: SECRET })
		).toEqual({ kind: "ok", upload: UPLOAD });
	});

	it("reports an expired token after the TTL", async () => {
		expect(
			await readScreenshotUploadToken(await sign(), {
				now: NOW + TTL_MS + 1,
				secret: SECRET,
			})
		).toEqual({ kind: "expired" });
	});

	it.each<[string, () => Promise<string>]>([
		[
			"a token signed with another secret",
			() =>
				signScreenshotUploadToken(UPLOAD, { now: NOW, secret: `${SECRET}x` }),
		],
		[
			"a token with a changed payload",
			async () => {
				const [, signature] = (await sign()).split(".");
				const forged = await signJson({ ...UPLOAD, caseId: "x" }, SECRET);
				return `${forged.split(".")[0]}.${signature}`;
			},
		],
		[
			"another signed value of the same secret (for example a session)",
			() => signJson({ exp: NOW + TTL_MS, userId: "u1" }, SECRET),
		],
		[
			"an attachment id instead of a token",
			() => Promise.resolve(UPLOAD.attachmentId),
		],
		["an empty string", () => Promise.resolve("")],
	])("rejects %s as invalid", async (_name, token) => {
		expect(
			await readScreenshotUploadToken(await token(), {
				now: NOW,
				secret: SECRET,
			})
		).toEqual({ kind: "invalid" });
	});
});
