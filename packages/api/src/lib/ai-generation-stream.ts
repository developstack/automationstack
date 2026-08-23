import type {
	GenerationEvent,
	RunGenerationAgentOptions,
} from "@automationstack/ai/agent";
import { runGenerationAgent } from "@automationstack/ai/agent";
import { updateGenerationSessionStatus } from "@automationstack/db/repositories/ai-sessions-repository";
import type { AiSessionStatus } from "@automationstack/db/schema/ai";

import { createAgentDeps } from "./ai-deps";

/** 会话建立事件：始终作为流的第一个事件，前端据此保存 sessionId。 */
export interface AiSessionEvent {
	sessionId: string;
	type: "session";
}

export type AiGenerateEvent = AiSessionEvent | GenerationEvent;

type GenerationModel = NonNullable<RunGenerationAgentOptions["model"]>;

let modelOverride: GenerationModel | undefined;

/**
 * 测试接缝：注入 mock 模型（如 ai/test 的 MockLanguageModelV4），
 * 传 undefined 恢复默认 provider。仅供冒烟脚本 / 单测使用。
 */
export function setGenerationModelOverride(model?: GenerationModel): void {
	modelOverride = model;
}

export interface StreamGenerationOptions {
	moduleId?: string;
	projectId: string;
	requirement: string;
	sessionId: string;
	signal?: AbortSignal;
}

interface FinalSessionState {
	error: string | null;
	status: AiSessionStatus;
}

function resolveFinalState(
	last: GenerationEvent | undefined,
	aborted: boolean
): FinalSessionState {
	if (last?.type === "error") {
		return {
			error: last.message,
			status: last.aborted ? "cancelled" : "failed",
		};
	}
	if (last?.type === "done") {
		return { error: null, status: "completed" };
	}
	return {
		error: aborted ? "生成已取消" : "生成流提前结束",
		status: "cancelled",
	};
}

/**
 * 把 agent 事件流转成 oRPC event iterator 的输出：
 * 首个事件带 sessionId（刷新恢复用），随后逐条透传 agent 事件，
 * 无论正常结束、失败还是被中止（消费端 return / abortSignal）都会落库终态。
 */
export async function* streamGeneration(
	options: StreamGenerationOptions
): AsyncGenerator<AiGenerateEvent> {
	yield { sessionId: options.sessionId, type: "session" };
	let last: GenerationEvent | undefined;
	try {
		for await (const event of runGenerationAgent({
			abortSignal: options.signal,
			deps: createAgentDeps(options.projectId),
			model: modelOverride,
			moduleId: options.moduleId,
			projectId: options.projectId,
			requirement: options.requirement,
			sessionId: options.sessionId,
		})) {
			last = event;
			yield event;
		}
	} finally {
		const state = resolveFinalState(last, options.signal?.aborted === true);
		await updateGenerationSessionStatus({
			error: state.error,
			id: options.sessionId,
			status: state.status,
		});
	}
}
