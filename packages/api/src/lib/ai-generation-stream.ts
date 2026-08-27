import type {
	GenerationEvent,
	RunGenerationAgentOptions,
} from "@automationstack/agent/agent";
import { runGenerationAgent } from "@automationstack/agent/agent";
import type { GenerationSessionStatus } from "@automationstack/agent/types";

import { createAgentPorts } from "./ai-ports";

/** 会话建立事件：始终作为流的第一个事件，前端据此保存 sessionId。 */
export interface AiSessionEvent {
	sessionId: string;
	type: "session";
}

export type AiGenerateEvent = AiSessionEvent | GenerationEvent;

type GenerationModel = NonNullable<RunGenerationAgentOptions["model"]>;

let modelOverride: GenerationModel | undefined;

/**
 * 测试接缝：注入 mock 模型（`@automationstack/agent/fake-model` 的
 * `createFakeModel()` + `createFakeStreamFn()`），传 undefined 恢复默认 provider。
 * 仅供冒烟脚本 / 单测使用。
 *
 * 注意这里的「模型」是 pi 的 `{ model, streamFn }` 一对，不是单个对象：
 * pi 把「模型元数据」和「怎么发请求」拆成了两个参数，api 这一层不需要知道
 * 这件事，所以 `GenerationModel` 仍然从 agent 包的签名里推导，保持一个键。
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
	status: GenerationSessionStatus;
}

/**
 * 只认终止性事件：`error` → failed/cancelled，`done` → completed，其余一律
 * 当「流没跑完」。**别把 `tool-error` 加进 error 分支**——它是非终止事件
 * （pi 把工具错误当成一条 tool 结果回灌给模型，下一步常常重试成功），
 * 归进去会把一次可恢复的重试记成整轮生成失败。
 *
 * 另一条同样要命、但只在 pi 上才存在的约束写在 agent-events.ts：中止与
 * provider 报错在 pi 下**不抛异常**，只是把 `stopReason` 标成
 * `aborted` / `error`，后面照常走完 `agent_end`。终止事件因此必须等到
 * `agent_end` 才发——在 `message_end` 当场发，`done` 会变成流的最后一条，
 * 这个函数就会把一次中止记成 completed。
 */
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
	const ports = createAgentPorts(options.projectId);
	let last: GenerationEvent | undefined;
	try {
		for await (const event of runGenerationAgent({
			abortSignal: options.signal,
			model: modelOverride,
			moduleId: options.moduleId,
			ports,
			projectId: options.projectId,
			requirement: options.requirement,
			sessionId: options.sessionId,
		})) {
			last = event;
			yield event;
		}
	} finally {
		const state = resolveFinalState(last, options.signal?.aborted === true);
		await ports.sessionStore.updateStatus({
			error: state.error,
			sessionId: options.sessionId,
			status: state.status,
		});
	}
}
