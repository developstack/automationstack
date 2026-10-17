import { randomUUID } from "node:crypto";

import { env } from "@automationstack/env/server";

import { protectedProcedure } from "../index";
import { UPLOAD_URL_TTL_SECONDS } from "../lib/attachment-policy";
import {
	caseAttachmentErrors,
	presignCaseImageUpload,
} from "../lib/case-image-presign";
import {
	SCREENSHOT_UPLOAD_TOKEN_TTL_SECONDS,
	signScreenshotUploadToken,
} from "../lib/case-screenshot-upload-token";
import { requireCaseMember } from "../lib/project-scope";
import { caseImagePresignSchema } from "../schemas/case-attachment";

export interface ColumnScreenshotUpload {
	contentType: string;
	/** 上传地址的有效秒数。 */
	expiresInSeconds: number;
	/** 上传凭证的有效秒数。 */
	tokenExpiresInSeconds: number;
	/** 写用例步骤时，在操作截图或预期截图中引用的上传凭证。 */
	uploadToken: string;
	uploadUrl: string;
}

export const caseScreenshotUploadProcedures = {
	/**
	 * MCP 写入截图的第一步：为一个用例的一张截图取得上传地址和上传凭证。
	 * 权限与修改这个用例相同。上传凭证只能用于这个用例，并且只能由取得它的用户使用。
	 */
	presignColumnScreenshotUpload: protectedProcedure
		.errors(caseAttachmentErrors)
		.input(caseImagePresignSchema)
		.use(requireCaseMember)
		.handler(
			async ({ context, errors, input }): Promise<ColumnScreenshotUpload> => {
				const { scope, storageKey, uploadUrl } = await presignCaseImageUpload(
					input,
					errors
				);
				const uploadToken = await signScreenshotUploadToken(
					{
						attachmentId: randomUUID(),
						caseId: scope.caseId,
						fileName: input.fileName,
						projectId: scope.projectId,
						storageKey,
						userId: context.user.id,
					},
					{ now: Date.now(), secret: env.SESSION_SECRET }
				);
				return {
					contentType: input.contentType,
					expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
					tokenExpiresInSeconds: SCREENSHOT_UPLOAD_TOKEN_TTL_SECONDS,
					uploadToken,
					uploadUrl,
				};
			}
		),
};
