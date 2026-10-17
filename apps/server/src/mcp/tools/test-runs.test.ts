import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";

import { registerTestRunTools } from "./test-runs";
import type { ApiClient, ToolResult } from "./tool-helpers";

const RUN_ID = "44444444-4444-4444-8444-444444444444";

type ToolHandler = (input: {
	reason?: string;
	runId: string;
}) => Promise<ToolResult>;

function registerAll(voidRun: ReturnType<typeof vi.fn>) {
	const handlers = new Map<string, ToolHandler>();
	const server = {
		registerTool: (name: string, _config: unknown, toolHandler: ToolHandler) =>
			handlers.set(name, toolHandler),
	} as unknown as McpServer;
	const client = { testRuns: { void: voidRun } } as unknown as ApiClient;
	registerTestRunTools(server, client);
	return handlers;
}

function registerWith(voidRun: ReturnType<typeof vi.fn>) {
	const handler = registerAll(voidRun).get("void_test_run");
	if (handler === undefined) {
		throw new Error("void_test_run 没有注册");
	}
	return handler;
}

describe("void_test_run：MCP 作废测试任务，权限由 testRuns.void 检查", () => {
	it("把 runId 和原因交给 testRuns.void，返回作废后的测试任务", async () => {
		const voidRun = vi.fn().mockResolvedValue({ id: RUN_ID, status: "voided" });
		const result = await registerWith(voidRun)({
			reason: "重复创建",
			runId: RUN_ID,
		});
		expect(voidRun).toHaveBeenCalledWith({ reason: "重复创建", runId: RUN_ID });
		expect(result.isError).toBeUndefined();
		expect(result.content[0]?.text).toContain('"status": "voided"');
	});

	it("没有权限或状态不允许时，把服务端的提示作为错误返回", async () => {
		const voidRun = vi
			.fn()
			.mockRejectedValue(new Error("已完成或已提交的测试任务不能作废"));
		const result = await registerWith(voidRun)({ runId: RUN_ID });
		expect(voidRun).toHaveBeenCalledWith({ reason: null, runId: RUN_ID });
		expect(result).toMatchObject({
			content: [{ text: "Error: 已完成或已提交的测试任务不能作废" }],
			isError: true,
		});
	});
});

it("测试任务不能删除，只能作废：只注册 void_test_run", () => {
	expect([...registerAll(vi.fn()).keys()]).toEqual(["void_test_run"]);
});
