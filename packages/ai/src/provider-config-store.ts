/**
 * `ProviderConfigStore` 端口的宿主侧实现。
 *
 * 「密钥从哪来、怎么解密」被刻意留在宿主：`@automationstack/agent` 只收一份
 * 已解析好的 `ResolvedProviderConfig`，因此那个包零 env / 零 db 依赖。
 * 本文件是唯一知道「生效配置 = 环境变量」这件事的地方。
 *
 * 生效口径与重构前**逐字不变**：只读 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`
 * 三个环境变量（见 config-store.ts 顶部）。`ai_provider_config` 那张表是
 * 登记处、不是生效决策点，这里**不会**从中隐式挑一行顶上——挑了就等于替
 * 管理员做了他没拍板的决定。等 agent 侧配置上线，改动只落在 `read()` 里，
 * agent 包一行都不用动，这正是把它做成端口的意义。
 */
import type {
	ProviderConfigStore,
	ResolvedProviderConfig,
} from "@automationstack/agent/ports";
import { PROVIDER_UNCONFIGURED_MESSAGE } from "@automationstack/agent/provider";

import { resolveAiConfig } from "./config-store";

/** 解析当前生效配置；没配齐返回 null（端口约定：不抛错）。 */
function readResolvedProviderConfig(): ResolvedProviderConfig | null {
	const resolution = resolveAiConfig();
	if (resolution.kind !== "ok") {
		return null;
	}
	return {
		apiKey: resolution.config.apiKey,
		baseUrl: resolution.config.baseURL,
		modelId: resolution.config.model,
	};
}

/**
 * 端口是 async 的（宿主以后要读库、要解密），当前实现同步可得，
 * 直接包一个已决议的 Promise，不引入多余的异步层。
 */
export function createProviderConfigStore(): ProviderConfigStore {
	return { read: () => Promise.resolve(readResolvedProviderConfig()) };
}

/**
 * 配置的「可用性视图」：只有模型 id 和不可用原因，**不含任何密钥字段**。
 * 路由层用它一次就同时拿到「能不能跑」和「跑不了为什么」，也避免把带明文
 * apiKey 的配置传进 API 层的作用域。
 */
export interface AiConfigStatus {
	modelId: string | null;
	problem: string | null;
}

export function readAiConfigStatus(): AiConfigStatus {
	const config = readResolvedProviderConfig();
	if (config === null) {
		// 与 agent 跑不起来时产出的 error 事件共用同一句文案（定义在 agent 包）。
		return { modelId: null, problem: PROVIDER_UNCONFIGURED_MESSAGE };
	}
	return { modelId: config.modelId, problem: null };
}
