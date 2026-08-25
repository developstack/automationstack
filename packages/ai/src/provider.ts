import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { AiConfigResolution } from "./config-store";
import { resolveAiConfig } from "./config-store";

const PROVIDER_NAME = "automationstack-ai";

/**
 * 生效配置只来自环境变量（见 config-store.ts 顶部：登记表不是生效决策点），
 * 解析是纯同步的，这两个入口也同步。agent 侧配置上线后这里会重新接上
 * 读库/读登记的逻辑，届时改回 async 并同步调整调用方
 * （`agent.ts`、`routers/ai.ts` 的 generate 处理器）。
 */

/** 配置不可用时给调用方看的原因；不含任何密钥内容。 */
export function describeAiConfigProblem(
	resolution: AiConfigResolution
): string | null {
	switch (resolution.kind) {
		case "unconfigured":
			return "AI 未配置：请管理员在 AI 配置页登记 Provider，或在 agent 配置中选择可用的 Provider";
		default:
			return null;
	}
}

/**
 * 配置的「可用性视图」：只有模型 id 和不可用原因，**不含任何密钥字段**。
 * 路由层用它一次就同时拿到「能不能跑」和「跑不了为什么」，也避免把带明文
 * apiKey 的 resolution 传进 API 层的作用域。
 */
export interface AiConfigStatus {
	modelId: string | null;
	problem: string | null;
}

export function readAiConfigStatus(): AiConfigStatus {
	const resolution = resolveAiConfig();
	if (resolution.kind === "ok") {
		return { modelId: resolution.config.model, problem: null };
	}
	return { modelId: null, problem: describeAiConfigProblem(resolution) };
}

/**
 * 惰性创建 OpenAI 兼容 provider 并返回用例生成所用的语言模型。
 * 仅在真正需要模型时调用；配置不可用时抛出带原因的错误。
 */
export function createGenerationModel(): LanguageModel {
	const resolution = resolveAiConfig();

	if (resolution.kind !== "ok") {
		throw new Error(
			describeAiConfigProblem(resolution) ?? "AI provider 未配置"
		);
	}

	const provider = createOpenAICompatible({
		apiKey: resolution.config.apiKey,
		baseURL: resolution.config.baseURL,
		name: PROVIDER_NAME,
	});

	return provider(resolution.config.model);
}
