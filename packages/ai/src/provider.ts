import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

import type { AiConfigResolution } from "./config-store";
import { resolveAiConfig } from "./config-store";

const PROVIDER_NAME = "automationstack-ai";

/**
 * `createGenerationModel` 从同步改成了异步：配置现在优先来自数据库，读库只能异步。
 *
 * 没有走「进程内 TTL 缓存 + 启动预热保住同步签名」那条路，因为调用点一共只有
 * 两处（`agent.ts` 的 `runGenerationAgent`、`routers/ai.ts` 的 generate 处理器），
 * 且都已经在 async 上下文里——改造成本几乎为零。而缓存方案的代价是真实的：
 * 管理员改完配置要等一个 TTL 才生效，正是「改完要重启才生效」的变体。
 *
 * 代价：每次 generate 多两次 `select` 单行主键查询（路由层判可用一次、
 * agent 建模型一次），相对一次 LLM 调用可以忽略。
 */

/** 配置不可用时给调用方看的原因；不含任何密钥内容。 */
export function describeAiConfigProblem(
	resolution: AiConfigResolution
): string | null {
	switch (resolution.kind) {
		case "master-key-missing":
			return "AI 配置已存入数据库，但 SECRET_ENCRYPTION_KEY 未配置或不是 32 字节的 base64 密钥，API Key 无法解密";
		case "undecryptable":
			return "数据库里的 API Key 解不开：SECRET_ENCRYPTION_KEY 很可能被更换过，请在管理员配置页重新填写 API Key";
		case "unconfigured":
			return "AI 未配置：请在管理员配置页填写 provider / model / base URL / API Key，或设置 AI_BASE_URL、AI_API_KEY、AI_MODEL 环境变量";
		default:
			return null;
	}
}

/**
 * 配置的「可用性视图」：只有模型 id 和不可用原因，**不含任何密钥字段**。
 * 路由层用它一次读库就同时拿到「能不能跑」和「跑不了为什么」，
 * 也避免把带明文 apiKey 的 resolution 传进 API 层的作用域。
 */
export interface AiConfigStatus {
	modelId: string | null;
	problem: string | null;
}

export async function readAiConfigStatus(): Promise<AiConfigStatus> {
	const resolution = await resolveAiConfig();
	if (resolution.kind === "ok") {
		return { modelId: resolution.config.model, problem: null };
	}
	return { modelId: null, problem: describeAiConfigProblem(resolution) };
}

/**
 * 惰性创建 OpenAI 兼容 provider 并返回用例生成所用的语言模型。
 * 仅在真正需要模型时调用；配置不可用时抛出带原因的错误。
 */
export async function createGenerationModel(): Promise<LanguageModel> {
	const resolution = await resolveAiConfig();

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
