/**
 * pi 事件流 → 领域事件的翻译，重点钉三件事：
 *
 * 1. 工具报错必须产出事件。它以前落进 `default: return`，被整个丢掉——
 *    模型给的 propose_cases 入参过不了 schema、或 execute 里抛错（比如
 *    moduleId 不存在），前端都收不到任何东西，界面就停在「生成中」。
 * 2. 它必须是**非终止**的 `tool-error` 而不是 `error`。`error` 是终止语义，
 *    ai-generation-stream.ts 的 resolveFinalState 见到它就把会话落成
 *    failed/cancelled；而 pi 会把工具错误回灌给模型继续下一轮，
 *    翻错一次可自愈的重试就变成整轮生成失败。
 * 3. 终止性事件只在 `agent_end` 发一条。pi 的中止/故障不抛异常，而是记在
 *    assistant 消息的 stopReason 上，之后照常走完 agent_end——在 message_end
 *    当场发 error 会让流的最后一条变成 done，中止就被记成了 completed。
 */
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";

import type { GenerationEvent } from "./agent-events";
import { translateAgentEvents } from "./agent-events";
import { createFakeAssistantMessage } from "./fake-model";
import type { SavedProposal } from "./tools";
import type { ProposedCase } from "./types";

const PROPOSAL: ProposedCase = {
	caseType: "functional",
	name: "登录成功",
	preconditions: null,
	priority: "P0",
	steps: [{ expected: "进入首页", id: "s1", step: "输入正确账号密码" }],
	tags: [],
};

/**
 * 手搓事件流而不是把 agentLoop 拉起来：被测的是翻译本身，走真 loop 就得连带
 * 把一个 provider mock（哪怕是本地 HTTP server）也拉起来。
 *
 * 不写成 `async function*`：函数体里没有任何真正的 await，只是要一个
 * AsyncIterable 喂给 translateAgentEvents。
 */
function streamOf(events: AgentEvent[]): AsyncIterable<AgentEvent> {
	const iterator = events[Symbol.iterator]();
	return {
		[Symbol.asyncIterator]: () => ({
			next: () => Promise.resolve(iterator.next()),
		}),
	};
}

function collect(
	events: AgentEvent[],
	pending: SavedProposal[] = []
): Promise<GenerationEvent[]> {
	return Array.fromAsync(translateAgentEvents(streamOf(events), pending));
}

function toolCallEvent(toolName: string): AgentEvent {
	return {
		args: {},
		toolCallId: "call-1",
		toolName,
		type: "tool_execution_start",
	};
}

/**
 * 工具失败事件。文案由 pi 放进 `result.content` 的文本块：`execute` 抛的是
 * Error 就是 `error.message`，抛的是别的就是 `String(...)`，入参过不了
 * JSON Schema 则是 pi 自己拼的校验报告——三种情况共用这一个形状。
 */
function toolErrorEvent(toolName: string, message: string): AgentEvent {
	return {
		isError: true,
		result: { content: [{ text: message, type: "text" }], details: undefined },
		toolCallId: "call-1",
		toolName,
		type: "tool_execution_end",
	};
}

function toolOkEvent(toolName: string): AgentEvent {
	return {
		isError: false,
		result: { content: [{ text: "ok", type: "text" }], details: undefined },
		toolCallId: "call-1",
		toolName,
		type: "tool_execution_end",
	};
}

/** pi 的收尾：assistant 消息带 stopReason，随后 agent_end。 */
function finishEvents(): AgentEvent[] {
	return [
		{ message: createFakeAssistantMessage("stop"), type: "message_end" },
		{ messages: [], type: "agent_end" },
	];
}

describe("translateAgentEvents", () => {
	it("tool-error 产出一条 tool-error 事件，而不是被 default 吞掉", async () => {
		const events = await collect([
			toolErrorEvent("propose_cases", "入参校验失败"),
		]);

		expect(events).toEqual([
			{
				message: "入参校验失败",
				toolName: "propose_cases",
				type: "tool-error",
			},
		]);
	});

	it("tool-error 不是终止事件：整个流里不能出现 error 事件", async () => {
		const events = await collect([
			toolErrorEvent("propose_cases", "moduleId 不存在"),
			...finishEvents(),
		]);

		expect(events.some((event) => event.type === "error")).toBe(false);
		expect(events.at(-1)).toEqual({ finishReason: "stop", type: "done" });
	});

	it("报错不打断翻译：后续步骤照常，流仍以 done 收尾", async () => {
		// 一次 propose_cases 入参校验失败 → 模型改正后重试 → 成功收尾。
		// 这是 tool-error 最常见的真实形态，整条流没有任何终止性事件。
		const events = await collect([
			toolCallEvent("propose_cases"),
			toolErrorEvent("propose_cases", "priority 只能是 P0~P3"),
			toolCallEvent("propose_cases"),
			toolOkEvent("propose_cases"),
			...finishEvents(),
		]);

		expect(events.map((event) => event.type)).toEqual([
			"tool-call",
			"tool-error",
			"tool-call",
			"done",
		]);
	});

	it("非 Error 的抛出物也要有可读文案，不能是 [object Object]", async () => {
		const events = await collect([toolErrorEvent("list_modules", "网关超时")]);

		expect(events).toEqual([
			{ message: "网关超时", toolName: "list_modules", type: "tool-error" },
		]);
	});

	it("报错时先把已落库但还没吐出的提案 drain 掉，别让它们只能靠刷新才出现", async () => {
		const pending: SavedProposal[] = [{ id: "prop-1", proposal: PROPOSAL }];

		const events = await collect(
			[toolErrorEvent("read_existing_cases", "模块不存在")],
			pending
		);

		expect(events.map((event) => event.type)).toEqual([
			"proposal",
			"tool-error",
		]);
		expect(pending).toHaveLength(0);
	});
});
