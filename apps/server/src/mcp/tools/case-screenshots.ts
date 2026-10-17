import { CASE_IMAGE_CONTENT_TYPES } from "@automationstack/api/lib/case-attachment-policy";
import { MAX_FILE_NAME_LENGTH } from "@automationstack/api/schemas/case-attachment";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { CREATE_SCREENSHOT_UPLOAD_DESCRIPTION } from "./case-tool-descriptions";
import {
	type ApiClient,
	jsonResult,
	safeToolCall,
	type ToolResult,
} from "./tool-helpers";

const createScreenshotUploadSchema = z.object({
	caseId: z
		.uuid()
		.describe(
			"Id of the existing case (from import_test_cases, read_cases or search_cases)."
		),
	contentType: z
		.enum(CASE_IMAGE_CONTENT_TYPES)
		.describe("Type of the local image file."),
	fileName: z
		.string()
		.min(1)
		.max(MAX_FILE_NAME_LENGTH)
		.describe("Name of the local image file, for example 'login.png'."),
	sizeBytes: z
		.number()
		.int()
		.positive()
		.describe("Size of the local image file in bytes. The maximum is 10 MB."),
});

type CreateScreenshotUploadInput = z.infer<typeof createScreenshotUploadSchema>;

/** 上传本地文件的 curl 命令。文件路径由 shell 变量 FILE 给出，所以文件名中的字符不会破坏命令。 */
function curlCommand(contentType: string, uploadUrl: string): string {
	return `curl --fail --silent --show-error -X PUT -H 'Content-Type: ${contentType}' --upload-file "$FILE" '${uploadUrl}'`;
}

async function createScreenshotUpload(
	client: ApiClient,
	input: CreateScreenshotUploadInput
): Promise<ToolResult> {
	const upload =
		await client.caseAttachments.presignColumnScreenshotUpload(input);
	return jsonResult({
		curl: curlCommand(upload.contentType, upload.uploadUrl),
		expiresInSeconds: upload.expiresInSeconds,
		headers: { "Content-Type": upload.contentType },
		method: "PUT",
		tokenExpiresInSeconds: upload.tokenExpiresInSeconds,
		uploadToken: upload.uploadToken,
		uploadUrl: upload.uploadUrl,
	});
}

/** MCP 写入操作截图和预期截图的第一步。第三步在 import_test_cases 中引用上传凭证。 */
export function registerCaseScreenshotTools(
	server: McpServer,
	client: ApiClient
): void {
	server.registerTool(
		"create_screenshot_upload",
		{
			description: CREATE_SCREENSHOT_UPLOAD_DESCRIPTION,
			inputSchema: createScreenshotUploadSchema.shape,
		},
		(input) => safeToolCall(() => createScreenshotUpload(client, input))
	);
}
