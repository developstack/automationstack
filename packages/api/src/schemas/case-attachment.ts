import { z } from "zod";

/** 用例附件文件名的最大长度。 */
export const MAX_FILE_NAME_LENGTH = 255;

export const fileNameSchema = z.string().min(1).max(MAX_FILE_NAME_LENGTH);

/** 为一个用例的一张图片取得上传地址：界面贴图和 MCP 写入截图共用。 */
export const caseImagePresignSchema = z.object({
	caseId: z.uuid(),
	contentType: z.string().min(1),
	fileName: fileNameSchema,
	sizeBytes: z.number().int().positive(),
});
