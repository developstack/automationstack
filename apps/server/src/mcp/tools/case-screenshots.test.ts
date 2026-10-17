import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";

import { registerCaseScreenshotTools } from "./case-screenshots";
import type { ApiClient, ToolResult } from "./tool-helpers";

const CASE_ID = "44444444-4444-4444-8444-444444444444";
const UPLOAD_URL =
	"https://r2.example.test/put?X-Amz-Signature=1&X-Amz-Expires=300";

type Handler = (input: Record<string, unknown>) => Promise<ToolResult>;

/** 注册截图工具，返回 create_screenshot_upload。presign 是假的 caseAttachments.presignColumnScreenshotUpload。 */
function uploadTool(presign: ReturnType<typeof vi.fn>): Handler {
	let handler: Handler | undefined;
	const server = {
		registerTool: (name: string, _config: unknown, toolHandler: Handler) => {
			if (name === "create_screenshot_upload") {
				handler = toolHandler;
			}
		},
	} as unknown as McpServer;
	registerCaseScreenshotTools(server, {
		caseAttachments: { presignColumnScreenshotUpload: presign },
	} as unknown as ApiClient);
	if (handler === undefined) {
		throw new Error("create_screenshot_upload 没有注册");
	}
	return handler;
}

const input = {
	caseId: CASE_ID,
	contentType: "image/png",
	fileName: "登录页.png",
	sizeBytes: 2048,
};

describe("create_screenshot_upload：为一个用例的一张截图取得上传地址", () => {
	it("returns the upload token, the URL and a curl command that uploads the local file", async () => {
		const presign = vi.fn().mockResolvedValue({
			contentType: "image/png",
			expiresInSeconds: 300,
			tokenExpiresInSeconds: 3600,
			uploadToken: "token-1",
			uploadUrl: UPLOAD_URL,
		});
		const result = await uploadTool(presign)(input);
		expect(presign).toHaveBeenCalledWith(input);
		expect(JSON.parse(result.content[0]?.text ?? "")).toEqual({
			curl: `curl --fail --silent --show-error -X PUT -H 'Content-Type: image/png' --upload-file "$FILE" '${UPLOAD_URL}'`,
			expiresInSeconds: 300,
			headers: { "Content-Type": "image/png" },
			method: "PUT",
			tokenExpiresInSeconds: 3600,
			uploadToken: "token-1",
			uploadUrl: UPLOAD_URL,
		});
	});

	it("returns the server message as an error, for example a case of another project", async () => {
		const presign = vi.fn().mockRejectedValue(new Error("你不是该项目的成员"));
		expect(await uploadTool(presign)(input)).toEqual({
			content: [{ text: "Error: 你不是该项目的成员", type: "text" }],
			isError: true,
		});
	});
});
