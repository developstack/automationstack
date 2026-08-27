import { agentLoop, convertToLlm } from "@earendil-works/pi-agent-core";

import type { GenerationEvent } from "./agent-events";
import {
	drainProposals,
	toErrorEvent,
	translateAgentEvents,
} from "./agent-events";
import type { AgentPorts } from "./ports";
import { buildGenerationPrompt, GENERATION_SYSTEM_PROMPT } from "./prompts";
import type { GenerationModel } from "./provider";
import { createGenerationModel } from "./provider";
import type { AgentToolSet, SavedProposal } from "./tools";
import { createAgentTools } from "./tools";

/** 事件定义搬去了 agent-events.ts，消费方仍从 `@automationstack/agent/agent` 取。 */
export type { GenerationEvent } from "./agent-events";

const MAX_AGENT_STEPS = 8;

export interface RunGenerationAgentOptions {
	abortSignal?: AbortSignal;
	/** 测试接缝：覆盖默认 provider 模型（pi 的 `Model` + `StreamFn` 一对）。 */
	model?: GenerationModel;
	moduleId?: string;
	/** 三个端口，由宿主注入（Postgres 适配器 / provider 配置读取）。 */
	ports: AgentPorts;
	projectId: string;
	requirement: string;
	sessionId: string;
}

/**
 * 组装并启动 pi 的 agentLoop。
 *
 * 单独拆出来只是为了把 runGenerationAgent 压回 50 行以内（eslint
 * max-lines-per-function），职责边界仍然清晰：这里只负责「怎么启动一次
 * 生成」，事件翻译留在 translateAgentEvents，错误兜底留在调用方。
 */
function startGenerationLoop(
	options: RunGenerationAgentOptions,
	runtime: GenerationModel,
	tools: AgentToolSet
) {
	// pi 没有 max-steps 这类选项，轮次上限只能自己数，挂在 shouldStopAfterTurn 上。
	// 计数器随本函数每次调用新建，因此并发的多次生成互不影响。
	let completedTurns = 0;

	return agentLoop(
		[
			{
				content: buildGenerationPrompt({
					moduleId: options.moduleId,
					requirement: options.requirement,
				}),
				role: "user",
				timestamp: Date.now(),
			},
		],
		{
			messages: [],
			systemPrompt: GENERATION_SYSTEM_PROMPT,
			tools: Object.values(tools),
		},
		{
			// 本 agent 不引入任何自定义消息类型，pi 自带的这份转换（过滤掉
			// bashExecution / custom 等 harness 专用消息）就够用。
			convertToLlm,
			model: runtime.model,
			shouldStopAfterTurn: () => {
				completedTurns += 1;
				return completedTurns >= MAX_AGENT_STEPS;
			},
		},
		options.abortSignal,
		runtime.streamFn
	);
}

/**
 * 极简单 loop 的测试用例生成 agent：
 * pi 的 `agentLoop` + 三个显式工具，pi 事件流翻译为领域事件流。
 * 任何错误（含中止）都以 error 事件产出，不向调用方抛出。
 */
export async function* runGenerationAgent(
	options: RunGenerationAgentOptions
): AsyncGenerator<GenerationEvent, void> {
	yield { message: "生成任务已启动", type: "status" };

	let runtime: GenerationModel;
	try {
		// `??` 短路：注入了 model 的调用方（冒烟脚本 / 单测）完全不碰配置端口。
		runtime =
			options.model ??
			createGenerationModel(await options.ports.providerConfig.read());
	} catch (error) {
		yield toErrorEvent(error, options.abortSignal);
		return;
	}

	const pending: SavedProposal[] = [];
	const tools = createAgentTools(options.ports, {
		onProposalsSaved: (saved) => {
			pending.push(...saved);
		},
		projectId: options.projectId,
		sessionId: options.sessionId,
	});

	try {
		yield* translateAgentEvents(
			startGenerationLoop(options, runtime, tools),
			pending
		);
	} catch (error) {
		// 与 translateAgentEnd 的终止性分支同理：抛错路径同样可能压着
		// 已落库但还没 yield 的提案，不先 drain 就永远不可见。
		yield* drainProposals(pending);
		yield toErrorEvent(error, options.abortSignal);
	}
}
