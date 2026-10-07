import type { AppRouterClient } from "@automationstack/api/routers/index";

export type ApiClient = AppRouterClient;

export const JSON_INDENT = 2;

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
