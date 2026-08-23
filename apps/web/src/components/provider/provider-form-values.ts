/**
 * 配置表单的值、校验与提交载荷。
 *
 * 单独拆出来是因为「apiKey 三态」这件事值得集中说清楚：
 * 省略 = 保持库里的 Key 不动、`clearApiKey` = 显式清空，两者同时给服务端会 400。
 * 空字符串一律按「没填」处理——一个失焦就把线上的 Key 抹掉是不可接受的。
 */
import type { AiProviderConfigState } from "@automationstack/api/routers/ai-provider-config";

export interface ProviderFormValues {
	/** 只活在内存里的一次性输入：保存成功后立刻清空，永不落任何持久化介质。 */
	apiKey: string;
	baseUrl: string;
	clearApiKey: boolean;
	/** 用户主动切到手工填写；目录不可用时上层会额外把它当成 true。 */
	manual: boolean;
	modelId: string;
	modelKeyword: string;
	providerId: string;
	providerKeyword: string;
}

export interface ProviderSaveInput {
	apiKey?: string;
	baseUrl: string;
	clearApiKey: boolean;
	modelId: string;
	providerId: string;
}

export function initialFormValues(
	state: AiProviderConfigState
): ProviderFormValues {
	return {
		apiKey: "",
		baseUrl: state.config?.baseUrl ?? "",
		clearApiKey: false,
		manual: false,
		modelId: state.config?.modelId ?? "",
		modelKeyword: "",
		providerId: state.config?.providerId ?? "",
		providerKeyword: "",
	};
}

function isHttpUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

/** 返回错误文案；通过校验时返回 null。 */
export function validateBaseUrl(value: string): string | null {
	const trimmed = value.trim();
	if (trimmed === "") {
		// 上游有 26 个 provider（anthropic、google 等）压根没给默认端点，必须手填
		return "base URL 必填；该 provider 没有默认地址时需要自己填写。";
	}
	if (!isHttpUrl(trimmed)) {
		return "请填写完整的 http(s) 地址，例如 https://api.example.com/v1";
	}
	return null;
}

export function validateIdentifier(
	value: string,
	label: string
): string | null {
	return value.trim() === "" ? `请先选择或填写 ${label}。` : null;
}

export function isFormValid(values: ProviderFormValues): boolean {
	return (
		validateIdentifier(values.providerId, "provider") === null &&
		validateIdentifier(values.modelId, "model") === null &&
		validateBaseUrl(values.baseUrl) === null
	);
}

/**
 * 组装提交载荷。三条互斥的路径写成三个 return，而不是一个带可选键的对象字面量：
 * 「什么时候不带 apiKey」是这个表单最要紧的一条语义，摊开写才看得见。
 */
export function toSaveInput(values: ProviderFormValues): ProviderSaveInput {
	const base = {
		baseUrl: values.baseUrl.trim(),
		modelId: values.modelId.trim(),
		providerId: values.providerId.trim(),
	};
	if (values.clearApiKey) {
		return { ...base, clearApiKey: true };
	}
	const apiKey = values.apiKey.trim();
	if (apiKey === "") {
		return { ...base, clearApiKey: false };
	}
	return { ...base, apiKey, clearApiKey: false };
}
