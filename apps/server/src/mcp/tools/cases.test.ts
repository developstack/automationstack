import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";

import { registerCaseTools } from "./cases";
import type { ApiClient, ToolResult } from "./tool-helpers";

// cases.ts 引用的 schema 所在模块会加载数据库连接。这里只测工具，不连接数据库
vi.mock("@automationstack/db", () => ({ db: {} }));

const LOGIN_ID = "44444444-4444-4444-8444-444444444444";
const LOGOUT_ID = "55555555-5555-4555-8555-555555555555";

type ToolHandler = (input: {
	ids: string[];
	status?: string;
}) => Promise<ToolResult>;

/** 注册用例工具，返回其中一个工具。cases 是假的 client.cases。 */
function caseTool(name: string, cases: Record<string, unknown>) {
	const handlers = new Map<string, ToolHandler>();
	const server = {
		registerTool: (
			toolName: string,
			_config: unknown,
			toolHandler: ToolHandler
		) => handlers.set(toolName, toolHandler),
	} as unknown as McpServer;
	registerCaseTools(server, { cases } as unknown as ApiClient);
	const handler = handlers.get(name);
	if (handler === undefined) {
		throw new Error(`${name} 没有注册`);
	}
	return handler;
}

const changeStatusTool = (changeStatus: ReturnType<typeof vi.fn>) =>
	caseTool("change_case_status", { changeStatus });

const parsed = (result: ToolResult) =>
	JSON.parse(result.content[0]?.text ?? "");

function caseChange(
	id: string,
	name: string,
	previousStatus: string,
	version: number | null
) {
	return {
		previousStatus,
		testCase: { id, name, status: "deprecated", steps: [{ id: "s1" }] },
		version: version === null ? null : { snapshot: {}, version },
	};
}

describe("change_case_status：MCP 批量改用例状态，权限由 cases.changeStatus 检查", () => {
	it("把 ids 和状态交给 cases.changeStatus；返回改了哪些、原来的状态和新版本号，不带用例正文", async () => {
		const changeStatus = vi.fn().mockResolvedValue({
			changes: [
				caseChange(LOGIN_ID, "登录成功", "active", 3),
				caseChange(LOGOUT_ID, "退出登录", "deprecated", null),
			],
		});
		const result = await changeStatusTool(changeStatus)({
			ids: [LOGIN_ID, LOGOUT_ID],
			status: "deprecated",
		});
		expect(changeStatus).toHaveBeenCalledWith({
			ids: [LOGIN_ID, LOGOUT_ID],
			status: "deprecated",
		});
		expect(parsed(result)).toEqual({
			changed: [
				{
					id: LOGIN_ID,
					name: "登录成功",
					previousStatus: "active",
					status: "deprecated",
					version: 3,
				},
			],
			unchanged: [{ id: LOGOUT_ID, name: "退出登录", status: "deprecated" }],
		});
	});

	it("用例不存在、分属不同项目或没有权限：把服务端的提示作为错误返回", async () => {
		const changeStatus = vi
			.fn()
			.mockRejectedValue(new Error("用例不存在，或分属不同项目"));
		const result = await changeStatusTool(changeStatus)({
			ids: [LOGIN_ID],
			status: "draft",
		});
		expect(result).toMatchObject({
			content: [{ text: "Error: 用例不存在，或分属不同项目" }],
			isError: true,
		});
	});
});

describe("delete_cases：MCP 一次批量删除用例，报告删除和跳过的用例", () => {
	const deleted = { id: LOGIN_ID, name: "登录成功" };
	const skipped = { id: LOGOUT_ID, name: "退出登录", referencedByRunCount: 2 };

	it("一次调用 cases.removeMany，原样返回删除、跳过和不存在的用例", async () => {
		const response = { deleted: [deleted], missingIds: [], skipped: [skipped] };
		const removeMany = vi.fn().mockResolvedValue(response);
		const result = await caseTool("delete_cases", { removeMany })({
			ids: [LOGIN_ID, LOGOUT_ID],
		});
		expect(removeMany).toHaveBeenCalledTimes(1);
		expect(removeMany).toHaveBeenCalledWith({ ids: [LOGIN_ID, LOGOUT_ID] });
		expect(parsed(result)).toEqual(response);
	});
});
