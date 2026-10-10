import { secretsEqual } from "../hmac";
import type { EffectiveAuthSettings } from "../settings-model";

export type CasdoorWebhookOutcome = "accepted" | "ignored" | "unauthorized";

export interface CasdoorWebhookRequest {
	rawBody: string;
	secretHeader: string | null;
	settings: EffectiveAuthSettings;
	/** 触发一次对账。调用方负责合并连续的触发。 */
	triggerReconcile: () => void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

function parseJson(text: string): Record<string, unknown> | null {
	try {
		return asRecord(JSON.parse(text));
	} catch {
		return null;
	}
}

function ownerFromId(id: string | null): string | null {
	const index = id?.indexOf("/") ?? -1;
	return id && index > 0 ? id.slice(0, index) : null;
}

/**
 * 被修改对象的组织（§11.10 第 9 项）。取 requestUri 中的 id=组织/名字，
 * 或 object 中的 owner。请求体中的 organization 是操作人的组织，不使用。
 * 不能确定时返回 null。
 */
export function eventOrganization(rawBody: string): string | null {
	const event = parseJson(rawBody);
	if (event === null) {
		return null;
	}
	const { requestUri } = event;
	if (
		typeof requestUri === "string" &&
		URL.canParse(requestUri, "http://casdoor")
	) {
		const owner = ownerFromId(
			new URL(requestUri, "http://casdoor").searchParams.get("id")
		);
		if (owner !== null) {
			return owner;
		}
	}
	const object =
		typeof event.object === "string" ? parseJson(event.object) : null;
	return typeof object?.owner === "string" ? object.owner : null;
}

/**
 * Casdoor webhook（plan 021 T11、§11.7、§11.10 第 7–9 项）。
 * 先用常量时间比较请求头中的密钥；没有配置密钥时一律拒绝。
 * 请求体只用来判断事件是否属于本组织：失败的操作也会发送 webhook，所以不使用其中的值。
 * 每个接受的事件只触发一次对账，对账通过管理 API 重新读取。
 */
export async function handleCasdoorWebhook(
	request: CasdoorWebhookRequest
): Promise<CasdoorWebhookOutcome> {
	const expected = request.settings.webhookSecret.value;
	if (!(expected && request.secretHeader)) {
		return "unauthorized";
	}
	if (!(await secretsEqual(request.secretHeader, expected))) {
		return "unauthorized";
	}
	if (request.settings.provider !== "casdoor") {
		return "ignored";
	}
	const owner = eventOrganization(request.rawBody);
	if (owner !== null && owner !== request.settings.organization) {
		return "ignored";
	}
	request.triggerReconcile();
	return "accepted";
}
