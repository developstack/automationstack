import type { AppRouterClient } from "@automationstack/api/routers/index";

/** In-process oRPC client the MCP tools delegate to (no HTTP round-trip). */
export type ApiClient = AppRouterClient;

/** Indent width used when serialising tool payloads to JSON text. */
export const JSON_INDENT = 2;

/** Matches the SDK's CallToolResult (which carries an index signature). */
export interface ToolResult {
	content: { text: string; type: "text" }[];
	isError?: boolean;
	[key: string]: unknown;
}

export function jsonResult(data: unknown): ToolResult {
	return {
		content: [{ text: JSON.stringify(data, null, JSON_INDENT), type: "text" }],
	};
}

/**
 * Runs a tool body and converts any thrown error (including typed oRPC
 * errors such as NOT_FOUND / BAD_REQUEST) into an isError tool result,
 * so the calling AI sees the message instead of a protocol failure.
 */
export async function safeToolCall(
	fn: () => Promise<ToolResult>
): Promise<ToolResult> {
	try {
		return await fn();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			content: [{ text: `Error: ${message}`, type: "text" }],
			isError: true,
		};
	}
}
