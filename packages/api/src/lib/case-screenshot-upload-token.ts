import { z } from "zod";

import { signJson, verifySignedJson } from "../auth/hmac";

/**
 * MCP 写入截图的上传凭证（uploadToken）。取得上传地址时由服务端签发，写用例步骤时在操作截图或
 * 预期截图中引用。凭证用 SESSION_SECRET 签名，客户端不能改变其中的用例、对象键或附件 id。
 */

const SECONDS_PER_HOUR = 3600;

const MS_PER_SECOND = 1000;

/** 凭证的有效期（小时）。上传地址只有几分钟有效，凭证要留出上传多张图片和写入用例的时间。 */
export const SCREENSHOT_UPLOAD_TOKEN_TTL_HOURS = 1;

export const SCREENSHOT_UPLOAD_TOKEN_TTL_SECONDS =
	SCREENSHOT_UPLOAD_TOKEN_TTL_HOURS * SECONDS_PER_HOUR;

/** 凭证的用途。同一个密钥也签名会话等其他数据，用途不同的签名值不能当作凭证。 */
const TOKEN_PURPOSE = "case-step-screenshot-upload";

/** 一次上传：上传到哪个用例的哪个对象键，登记后的附件 id 和文件名。 */
export interface ScreenshotUpload {
	attachmentId: string;
	caseId: string;
	fileName: string;
	projectId: string;
	storageKey: string;
}

const tokenPayloadSchema = z.object({
	attachmentId: z.uuid(),
	caseId: z.uuid(),
	exp: z.number(),
	fileName: z.string().min(1),
	projectId: z.uuid(),
	purpose: z.literal(TOKEN_PURPOSE),
	storageKey: z.string().min(1),
});

export type ReadScreenshotUploadTokenResult =
	| { kind: "expired" }
	| { kind: "invalid" }
	| { kind: "ok"; upload: ScreenshotUpload };

interface TokenClock {
	now: number;
	secret: string;
}

export function signScreenshotUploadToken(
	upload: ScreenshotUpload,
	{ now, secret }: TokenClock
): Promise<string> {
	return signJson(
		{
			...upload,
			exp: now + SCREENSHOT_UPLOAD_TOKEN_TTL_SECONDS * MS_PER_SECOND,
			purpose: TOKEN_PURPOSE,
		},
		secret
	);
}

export async function readScreenshotUploadToken(
	token: string,
	{ now, secret }: TokenClock
): Promise<ReadScreenshotUploadTokenResult> {
	const parsed = tokenPayloadSchema.safeParse(
		await verifySignedJson(token, secret)
	);
	if (!parsed.success) {
		return { kind: "invalid" };
	}
	const { exp, purpose: _purpose, ...upload } = parsed.data;
	if (now > exp) {
		return { kind: "expired" };
	}
	return { kind: "ok", upload };
}
