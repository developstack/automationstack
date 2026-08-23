import type { ProposedCase } from "@automationstack/db/schema/ai";
import type { LanguageModel, TextStreamPart } from "ai";
import { stepCountIs, streamText } from "ai";

import { buildGenerationPrompt, GENERATION_SYSTEM_PROMPT } from "./prompts";
import { createGenerationModel } from "./provider";
import type { AgentDeps, AgentToolSet, SavedProposal } from "./tools";
import { createAgentTools } from "./tools";

const MAX_AGENT_STEPS = 8;

/**
 * agent 对外的领域事件流，消费方（oRPC event iterator / 前端）只依赖此联合类型。
 */
export type GenerationEvent =
	| { type: "status"; message: string }
	| { type: "text-delta"; text: string }
	| { type: "tool-call"; toolName: string }
	| { type: "proposal"; id: string; proposal: ProposedCase }
	| { type: "done"; finishReason: string }
	| { type: "error"; aborted: boolean; message: string };

export interface RunGenerationAgentOptions {
	abortSignal?: AbortSignal;
	/** 数据访问依赖，由调用方基于 packages/db repository 注入。 */
	deps: AgentDeps;
	/** 测试接缝：覆盖默认 provider 模型（如 ai/test 的 MockLanguageModelV4）。 */
	model?: LanguageModel;
	moduleId?: string;
	projectId: string;
	requirement: string;
	sessionId: string;
}

function describeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function toErrorEvent(error: unknown, signal?: AbortSignal): GenerationEvent {
	const aborted = signal?.aborted === true || isAbortError(error);
	return { aborted, message: describeError(error), type: "error" };
}

function* drainProposals(
	pending: SavedProposal[]
): Generator<GenerationEvent, void> {
	while (pending.length > 0) {
		const saved = pending.shift();
		if (saved) {
			yield { id: saved.id, proposal: saved.proposal, type: "proposal" };
		}
	}
}

function* translatePart(
	part: TextStreamPart<AgentToolSet>,
	pending: SavedProposal[]
): Generator<GenerationEvent, void> {
	switch (part.type) {
		case "text-delta":
			yield { text: part.text, type: "text-delta" };
			return;
		case "tool-call":
			yield { toolName: part.toolName, type: "tool-call" };
			return;
		case "tool-result":
			yield* drainProposals(pending);
			return;
		// 终止性分支一律先 drain：propose_cases 的 execute 可能已把提案写库，
		// 而 tool-result 尚未到达就被 abort/error 打断。不先吐出来，这些提案
		// 在本次流里永远不可见，前端只能靠刷新走 getSession 才恢复。
		case "abort":
			yield* drainProposals(pending);
			yield { aborted: true, message: "生成已中止", type: "error" };
			return;
		case "error":
			yield* drainProposals(pending);
			yield {
				aborted: false,
				message: describeError(part.error),
				type: "error",
			};
			return;
		case "finish":
			yield* drainProposals(pending);
			yield { finishReason: part.finishReason, type: "done" };
			return;
		default:
			return;
	}
}

async function* translateFullStream(
	fullStream: AsyncIterable<TextStreamPart<AgentToolSet>>,
	pending: SavedProposal[]
): AsyncGenerator<GenerationEvent, void> {
	for await (const part of fullStream) {
		yield* translatePart(part, pending);
	}
}

/**
 * 极简单 loop 的测试用例生成 agent：
 * streamText + 三个显式工具，fullStream 翻译为领域事件流。
 * 任何错误（含中止）都以 error 事件产出，不向调用方抛出。
 */
export async function* runGenerationAgent(
	options: RunGenerationAgentOptions
): AsyncGenerator<GenerationEvent, void> {
	yield { message: "生成任务已启动", type: "status" };

	let model: LanguageModel;
	try {
		model = options.model ?? (await createGenerationModel());
	} catch (error) {
		yield toErrorEvent(error, options.abortSignal);
		return;
	}

	const pending: SavedProposal[] = [];
	const tools = createAgentTools(options.deps, {
		onProposalsSaved: (saved) => {
			pending.push(...saved);
		},
		projectId: options.projectId,
		sessionId: options.sessionId,
	});

	try {
		const result = streamText({
			abortSignal: options.abortSignal,
			instructions: GENERATION_SYSTEM_PROMPT,
			model,
			prompt: buildGenerationPrompt({
				moduleId: options.moduleId,
				requirement: options.requirement,
			}),
			stopWhen: stepCountIs(MAX_AGENT_STEPS),
			tools,
		});

		yield* translateFullStream(result.fullStream, pending);
	} catch (error) {
		// 同上：抛错路径同样可能有已落库但未 yield 的提案。
		yield* drainProposals(pending);
		yield toErrorEvent(error, options.abortSignal);
	}
}
