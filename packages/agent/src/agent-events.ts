/**
 * agent 的领域事件定义，以及 pi 事件流 → 领域事件的翻译。
 *
 * 与 agent.ts 分文件不是为了行数，是为了可测：翻译是纯函数，落在这里就能
 * 不牵动 `agentLoop`、不牵动任何 provider 配置地单独钉住。
 * （本包零 db / 零 env 依赖之后，import agent.ts 本身也不再有副作用，但
 * 「纯翻译单独成文件」这条理由与依赖无关，仍然成立。）
 */
import type { AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";

import type { SavedProposal } from "./tools";
import type { ProposedCase } from "./types";

/**
 * agent 对外的领域事件流，消费方（oRPC event iterator / 前端）只依赖此联合类型。
 *
 * 只有 `done` 与 `error` 是终止性的（`resolveFinalState` 据此落库终态），
 * 其余都是过程事件——新增分支时先想清楚它属于哪一类。
 */
export type GenerationEvent =
	| { type: "status"; message: string }
	| { type: "text-delta"; text: string }
	| { type: "tool-call"; toolName: string }
	/** 单次工具调用失败，非终止：模型拿到错误后往往会重试并成功。 */
	| { type: "tool-error"; toolName: string; message: string }
	| { type: "proposal"; id: string; proposal: ProposedCase }
	| { type: "done"; finishReason: string }
	| { type: "error"; aborted: boolean; message: string };

/** pi 用这两个 stopReason 表示「这一轮没能正常收场」。 */
const ABORTED_STOP_REASON = "aborted";
const ERROR_STOP_REASON = "error";

const ABORTED_MESSAGE = "生成已中止";
const UNKNOWN_FAILURE_MESSAGE = "生成失败";
const NO_TURN_FINISH_REASON = "unknown";

function describeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

export function toErrorEvent(
	error: unknown,
	signal?: AbortSignal
): GenerationEvent {
	const aborted = signal?.aborted === true || isAbortError(error);
	return { aborted, message: describeError(error), type: "error" };
}

export function* drainProposals(
	pending: SavedProposal[]
): Generator<GenerationEvent, void> {
	while (pending.length > 0) {
		const saved = pending.shift();
		if (saved) {
			yield { id: saved.id, proposal: saved.proposal, type: "proposal" };
		}
	}
}

/**
 * 最近一条 assistant 消息的收场。
 *
 * pi 的中止与 provider 故障**都不抛异常**：它把结果记在
 * `stopReason`（`"aborted"` / `"error"`）与 `errorMessage` 上，然后照常走完
 * `agent_end`。所以终止事件不能在 `message_end` 当场发——那样流的最后一条
 * 会变成 `done`，宿主的 `resolveFinalState` 就把一次中止记成了 completed。
 * 这里只记录，等 `agent_end` 再决定发 `done` 还是 `error`。
 */
interface AssistantOutcome {
	errorMessage: string | undefined;
	stopReason: string;
}

function toAssistantOutcome(
	message: AgentMessage
): AssistantOutcome | undefined {
	// 单出口三元而非 `if (...) { return; }`：后者会让本函数一条 return 带值、
	// 一条不带，撞 eslint 的 consistent-return。非 assistant 消息（工具结果、
	// harness 自定义消息）本来就没有 stopReason，仍然要如实回 undefined，
	// 由调用方用 `?? outcome` 保留上一条 assistant 的结果。
	return message.role === "assistant"
		? {
				errorMessage: message.errorMessage,
				stopReason: message.stopReason,
			}
		: undefined;
}

function isTextContent(part: unknown): part is TextContent {
	return (part as TextContent | undefined)?.type === "text";
}

/**
 * 工具失败的文案。
 *
 * pi 把两种失败编码成同一个形状——`tool_execution_end` 且 `isError`，文案在
 * `result.content` 的文本块里：`execute` 抛错时是 `error.message`（非 Error
 * 抛出物走 `String()`），入参过不了 JSON Schema 时是 pi 自己拼的校验报告。
 * `result` 在 pi 的类型里是 `any`，所以这里按最小假设自己判形状。
 */
function toToolErrorMessage(result: unknown): string {
	const content = (result as { content?: unknown } | null | undefined)?.content;
	if (!Array.isArray(content)) {
		return UNKNOWN_FAILURE_MESSAGE;
	}
	const text = content
		.filter(isTextContent)
		.map((part) => part.text)
		.join("\n");
	return text.length > 0 ? text : UNKNOWN_FAILURE_MESSAGE;
}

/**
 * 工具执行结束。**不论成败都先 drain**：propose_cases 的 execute 已把提案
 * 写库，而报错的若是它之后的另一个工具，此刻还压着上一批没 yield 的提案。
 *
 * 失败刻意翻成非终止的 `tool-error` 而不是 `error`：后者是终止语义，会让
 * `resolveFinalState` 把整个会话落成 failed，而 pi 是把工具错误回灌给模型
 * 继续下一轮的——一次可恢复的重试会被记成整轮生成失败。
 */
function* translateToolEnd(
	event: Extract<AgentEvent, { type: "tool_execution_end" }>,
	pending: SavedProposal[]
): Generator<GenerationEvent, void> {
	yield* drainProposals(pending);
	if (event.isError) {
		yield {
			message: toToolErrorMessage(event.result),
			toolName: event.toolName,
			type: "tool-error",
		};
	}
}

/**
 * 整轮结束，产出**唯一**一条终止性事件。先 drain 同理：中止可能卡在
 * 提案已落库、`tool_execution_end` 还没到达的位置，不吐出来这些提案在本次
 * 流里就永远不可见，前端只能靠刷新走 getSession 才恢复。
 */
function* translateAgentEnd(
	outcome: AssistantOutcome | undefined,
	pending: SavedProposal[]
): Generator<GenerationEvent, void> {
	yield* drainProposals(pending);

	const aborted = outcome?.stopReason === ABORTED_STOP_REASON;
	if (aborted || outcome?.stopReason === ERROR_STOP_REASON) {
		yield {
			aborted,
			// 中止时 pi 给的是英文的 "Request aborted"，对用户没有信息量，
			// 用本包统一的中文文案；provider 故障的原文则原样透出去。
			message: aborted
				? ABORTED_MESSAGE
				: (outcome?.errorMessage ?? UNKNOWN_FAILURE_MESSAGE),
			type: "error",
		};
		return;
	}

	yield {
		finishReason: outcome?.stopReason ?? NO_TURN_FINISH_REASON,
		type: "done",
	};
}

/**
 * pi 的 `AgentEvent` 流 → 领域事件流。
 *
 * `agentLoop()` 返回的 `EventStream` 实现了 `AsyncIterable`，所以这里收的
 * 就是它本身，不需要额外的适配。
 */
export async function* translateAgentEvents(
	events: AsyncIterable<AgentEvent>,
	pending: SavedProposal[]
): AsyncGenerator<GenerationEvent, void> {
	let outcome: AssistantOutcome | undefined;

	for await (const event of events) {
		switch (event.type) {
			case "message_update": {
				const delta = event.assistantMessageEvent;
				if (delta.type === "text_delta") {
					yield { text: delta.delta, type: "text-delta" };
				}
				break;
			}
			case "message_end":
				// user / toolResult 消息也走这个事件，`toAssistantOutcome` 返回
				// undefined 时保留上一轮的收场，别把它冲掉。
				outcome = toAssistantOutcome(event.message) ?? outcome;
				break;
			case "tool_execution_start":
				yield { toolName: event.toolName, type: "tool-call" };
				break;
			case "tool_execution_end":
				yield* translateToolEnd(event, pending);
				break;
			case "agent_end":
				yield* translateAgentEnd(outcome, pending);
				break;
			// 其余分支**故意**不产出领域事件，不是漏的：
			// - agent_start / turn_start / turn_end / message_start：生命周期标记，
			//   本流的起止已由 status 与终止事件覆盖；
			// - message_update 里除 text_delta 外的子类型：思维链（thinking_*）
			//   不外露，工具入参的流式片段（toolcall_*）在 tool-call 到达时已经
			//   是完整入参，面板不逐字展示参数；
			// - tool_execution_update：本 agent 的三个工具都不调 onUpdate。
			default:
				break;
		}
	}
}
