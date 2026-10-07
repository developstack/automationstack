const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MIN = 500;

export type JiraFailureKind =
	| "auth-failed"
	| "forbidden"
	| "invalid-response"
	| "network-error"
	| "not-found"
	| "rate-limited"
	| "timeout"
	| "unavailable";

export interface JiraFailure {
	kind: JiraFailureKind;
	message: string | null;
}

export type JiraResult<T> =
	| { ok: false; failure: JiraFailure }
	| { ok: true; value: T };

export function classifyStatus(status: number): JiraFailureKind {
	if (status === HTTP_UNAUTHORIZED) {
		return "auth-failed";
	}
	if (status === HTTP_FORBIDDEN) {
		return "forbidden";
	}
	if (status === HTTP_NOT_FOUND) {
		return "not-found";
	}
	if (status === HTTP_TOO_MANY_REQUESTS) {
		return "rate-limited";
	}
	if (status >= HTTP_SERVER_ERROR_MIN) {
		return "unavailable";
	}
	return "invalid-response";
}

export function readErrorMessage(payload: unknown): string | null {
	if (typeof payload !== "object" || payload === null) {
		return null;
	}
	const record = payload as Record<string, unknown>;
	const messages = record.errorMessages;
	if (Array.isArray(messages) && typeof messages[0] === "string") {
		return messages[0];
	}
	const { errors } = record;
	if (typeof errors === "object" && errors !== null) {
		const first = Object.values(errors).find(
			(value) => typeof value === "string"
		);
		if (typeof first === "string") {
			return first;
		}
	}
	return null;
}

export function classifyThrown(error: unknown): JiraFailure {
	const isTimeout =
		error instanceof Error &&
		(error.name === "TimeoutError" || error.name === "AbortError");
	return { kind: isTimeout ? "timeout" : "network-error", message: null };
}

export function describeJiraFailure(failure: JiraFailure): string {
	const detail = failure.message === null ? "" : `：${failure.message}`;
	switch (failure.kind) {
		case "auth-failed":
			return `Jira 拒绝了凭据，请在项目设置里重新填写邮箱与 API Token${detail}`;
		case "forbidden":
			return `该 Jira 账号对这个项目没有权限${detail}`;
		case "invalid-response":
			return `Jira 拒绝了这次请求，请检查站点地址、project key 与 issue type 是否正确${detail}`;
		case "network-error":
			return `连不上 Jira，请检查站点地址与网络${detail}`;
		case "not-found":
			return `Jira 上找不到对应的对象${detail}`;
		case "rate-limited":
			return `Jira 限流了，请稍后重试${detail}`;
		case "timeout":
			return `Jira 响应超时，请稍后重试${detail}`;
		default:
			return `Jira 暂时不可用，请稍后重试${detail}`;
	}
}
