import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-completions";

import type { ResolvedProviderConfig } from "./ports";

const PROVIDER_NAME = "automationstack-ai";

/**
 * 模型元数据里的两个容量数字。
 *
 * pi 的 `Model` 是一份**静态元数据**（它没有 models.dev 那样的在线目录可查），
 * 这两个值只用于 pi 内部的上下文估算与请求的 max_tokens 字段，不是能力声明。
 * 取一个对绝大多数 OpenAI 兼容端点都成立的保守值：真实上限由端点自己兜底。
 */
const CONTEXT_WINDOW_TOKENS = 128_000;
const MAX_OUTPUT_TOKENS = 8192;

/** 本包不做计费，成本一律记 0；pi 要求这个字段必填。 */
const NO_COST = { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 } as const;

/**
 * 配置不可用时给调用方看的原因；不含任何密钥内容。
 *
 * 文案留在本包而不是宿主侧：agent 跑不起来时产出的 `error` 事件、以及
 * 路由层预检返回的 SERVICE_UNAVAILABLE 必须是同一句话，两处各写一份迟早对不上。
 */
export const PROVIDER_UNCONFIGURED_MESSAGE =
	"AI 未配置：请管理员在 AI 配置页登记 Provider，或在 agent 配置中选择可用的 Provider";

/**
 * 跑一轮生成所需的模型运行时。
 *
 * AI SDK 的 `LanguageModel` 一个对象同时管「模型是谁」和「怎么发请求」，
 * pi 把这两件事拆成了 `Model`（纯元数据，可序列化）与 `StreamFn`（带密钥的
 * 闭包）。这里把它们重新绑成一份整体，测试接缝因此仍是**一个**可注入对象，
 * 宿主侧的 `RunGenerationAgentOptions["model"]` 不用跟着变成两个键。
 *
 * 密钥只活在 `streamFn` 的闭包里，不进 `model`：`model` 会被 pi 塞进 transcript
 * 相关的结构里传来传去，挂在上面迟早被日志或序列化带出去。
 */
export interface GenerationModel {
	model: Model<"openai-completions">;
	streamFn: StreamFn;
}

/**
 * 由**已解析好的**配置创建 OpenAI 兼容端点的模型运行时。
 *
 * 本包不读环境变量、不读库、不解密：配置从哪来是 `ProviderConfigStore` 的事。
 * 传入 `null`（宿主报告「没配」）时抛出带原因的错误，由 agent 翻成 error 事件。
 */
export function createGenerationModel(
	config: ResolvedProviderConfig | null
): GenerationModel {
	if (config === null) {
		throw new Error(PROVIDER_UNCONFIGURED_MESSAGE);
	}

	const model: Model<"openai-completions"> = {
		api: "openai-completions",
		baseUrl: config.baseUrl,
		contextWindow: CONTEXT_WINDOW_TOKENS,
		cost: NO_COST,
		id: config.modelId,
		input: ["text"],
		maxTokens: MAX_OUTPUT_TOKENS,
		name: config.modelId,
		provider: PROVIDER_NAME,
		reasoning: false,
	};

	const { apiKey } = config;
	return {
		model,
		// 刻意忽略回传的 model：agentLoop 回传的就是上面这一份，用闭包变量可以
		// 省掉一次 `Model<Api>` → `Model<"openai-completions">` 的窄化断言。
		streamFn: (_model, context, options) =>
			streamSimple(model, context, { ...options, apiKey }),
	};
}
