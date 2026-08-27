/**
 * 三个工具与端口之间的契约。
 *
 * 这些测试的存在本身就是重构的验收项：以前 `createAgentTools` 吃的是一份
 * 直连 repository 的依赖对象，要钉住「工具到底问了谁、写了什么」就得起库；
 * 现在换成端口，in-memory 假实现就够，整包零 db / 零 env 依赖。
 */
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { TSchema } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { createFakePorts } from "./fake-ports";
import type {
	AgentToolContext,
	AgentToolSet,
	ProposeCasesOutput,
	SavedProposal,
} from "./tools";
import { createAgentTools, type proposedCaseSchema } from "./tools";

const PROJECT_ID = "project-1";
const SESSION_ID = "session-1";

/** `execute` 的第一个入参是 toolCallId，真实调用时由 pi 的 agentLoop 填。 */
const TOOL_CALL_ID = "call-1";

/**
 * 取一次工具执行的领域返回值。pi 的 `AgentToolResult` 有两半：`content` 是
 * 回灌给模型的文本，`details` 是原样的领域值——断言要看的是后者。
 */
async function detailsOf<TDetails>(
	tool: AgentTool<TSchema, TDetails>,
	params: unknown
): Promise<TDetails> {
	const result = await tool.execute(TOOL_CALL_ID, params);
	return result.details;
}

function contextOf(
	onProposalsSaved?: (saved: SavedProposal[]) => void
): AgentToolContext {
	return { onProposalsSaved, projectId: PROJECT_ID, sessionId: SESSION_ID };
}

const CASE_INPUT: z.infer<typeof proposedCaseSchema> = {
	caseType: "functional",
	name: "登录成功",
	priority: "P0",
	steps: [{ expected: "进入首页", step: "输入正确账号密码" }],
};

function proposeCases(
	tools: AgentToolSet,
	proposals: z.infer<typeof proposedCaseSchema>[]
): Promise<ProposeCasesOutput> {
	return detailsOf(tools.propose_cases, { proposals });
}

describe("list_modules", () => {
	it("经 CaseCatalog 取模块大纲，并带上当前项目 id", async () => {
		const ports = createFakePorts({ outline: "- 登录 (id: m-1)\n  - 注册" });
		const tools = createAgentTools(ports, contextOf());

		const outline = await detailsOf(tools.list_modules, {});

		expect(outline).toBe("- 登录 (id: m-1)\n  - 注册");
		expect(ports.caseCatalog.outlineCalls).toEqual([PROJECT_ID]);
	});
});

describe("read_existing_cases", () => {
	it("经 CaseCatalog 按 moduleId 取已有用例摘要", async () => {
		const summary = {
			caseType: "functional" as const,
			id: "case-1",
			name: "已有用例",
			priority: "P1" as const,
			tags: ["正常流"],
		};
		const ports = createFakePorts({ existingCases: [summary] });
		const tools = createAgentTools(ports, contextOf());

		const cases = await detailsOf(tools.read_existing_cases, {
			moduleId: "m-1",
		});

		expect(cases).toEqual([summary]);
		expect(ports.caseCatalog.existingCaseCalls).toEqual(["m-1"]);
	});
});

describe("propose_cases", () => {
	it("提案落盘到 SessionStore，返回的 id 与入参顺序一一对应", async () => {
		const ports = createFakePorts();
		const tools = createAgentTools(ports, contextOf());

		const output = await proposeCases(tools, [
			{ ...CASE_INPUT, name: "第一条" },
			{ ...CASE_INPUT, name: "第二条" },
		]);

		expect(output).toEqual({
			proposalIds: ["prop-0", "prop-1"],
			savedCount: 2,
		});
		expect(
			ports.sessionStore.saved.get(SESSION_ID)?.map((one) => one.name)
		).toEqual(["第一条", "第二条"]);
	});

	it("落盘前补齐可选字段：preconditions 归 null、tags 归空数组、步骤补 id", async () => {
		const ports = createFakePorts();
		const tools = createAgentTools(ports, contextOf());

		await proposeCases(tools, [CASE_INPUT]);

		const [stored] = ports.sessionStore.saved.get(SESSION_ID) ?? [];
		expect(stored?.preconditions).toBeNull();
		expect(stored?.tags).toEqual([]);
		expect(stored?.steps[0]?.id).toEqual(expect.any(String));
	});

	it("落盘成功后回调 onProposalsSaved，把 id 与提案配成对", async () => {
		const ports = createFakePorts();
		const saved: SavedProposal[] = [];
		const tools = createAgentTools(
			ports,
			contextOf((batch) => saved.push(...batch))
		);

		await proposeCases(tools, [{ ...CASE_INPUT, name: "唯一一条" }]);

		expect(saved).toHaveLength(1);
		expect(saved[0]?.id).toBe("prop-0");
		expect(saved[0]?.proposal.name).toBe("唯一一条");
	});

	it("多次调用是追加而不是覆盖（模型可分批提交）", async () => {
		const ports = createFakePorts();
		const tools = createAgentTools(ports, contextOf());

		await proposeCases(tools, [{ ...CASE_INPUT, name: "第一批" }]);
		const second = await proposeCases(tools, [
			{ ...CASE_INPUT, name: "第二批" },
		]);

		expect(second.proposalIds).toEqual(["prop-1"]);
		expect(ports.sessionStore.saved.get(SESSION_ID)).toHaveLength(2);
	});
});
