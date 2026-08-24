/**
 * Jira 调用失败的**分类与措辞**：HTTP 状态 / 抛出的异常 → `JiraFailure`
 * → 一句给人看的话。
 *
 * 分类和措辞放在同一个文件里，是为了让「加一种失败」只有一个落点：
 * 往 `JiraFailureKind` 里加一项，紧接着的 `describeJiraFailure` 的 switch
 * 就会在编译期提醒你补一句文案。拆成两个文件，迟早出现一种前端只能显示
 * 「Jira 暂时不可用」的失败。
 *
 * ⚠️ 全流程**不携带凭据**：`message` 只来自 Jira 返回体的 errorMessages，
 * 请求头从不入日志、不入返回值。
 */

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MIN = 500;

/**
 * 失败分类。刻意分这么细，是因为**处置动作完全不同**：
 * - `auth-failed`：凭据过期 / 邮箱不对 —— 让管理员去配置页重填；
 * - `forbidden`：账号认得，但对这个项目没权限 —— 找 Jira 管理员加权限；
 * - `not-found`：issue key 或 project key 不存在 —— 用户输入错了；
 * - `rate-limited`：撞限流 —— 稍后重试即可，不是配置问题；
 * - `timeout` / `network-error`：Jira 侧不可达 —— 稍后重试；
 * - `unavailable`：Jira 5xx —— 同上，但明确是对方的错；
 * - `invalid-response`：返回了非预期结构 —— 大概率是 siteUrl 填成了别的站点。
 *
 * ⚠️ 任何一种失败都**不携带凭据**：`message` 只取 Jira 返回体里的
 * errorMessages 字段，请求头从不入日志、不入返回值。
 */
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
	/** Jira 自己给的可读原因，取不到时为 null。绝不含凭据。 */
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
	// 4xx 的其余情况（最常见的是 400：字段不合法 / 描述不是 ADF）都归到这里，
	// 因为对调用方而言处置一样：请求本身有问题，重试不会好。
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
	// AbortSignal.timeout 触发时抛的是 name === "TimeoutError" 的 DOMException；
	// 其余（DNS 解析不了、连接被拒、TLS 失败）统一算网络不可达。
	const isTimeout =
		error instanceof Error &&
		(error.name === "TimeoutError" || error.name === "AbortError");
	return { kind: isTimeout ? "timeout" : "network-error", message: null };
}

/**
 * 把 Jira 侧的失败翻成一句给人看的话。
 *
 * 分得细是因为处置动作完全不同：凭据过期要去配置页重填、没权限要找 Jira
 * 管理员、限流只要等一会儿。一律显示「操作失败」等于把排查成本转嫁给用户。
 * **翻译结果里没有任何凭据**——`failure.message` 只来自 Jira 返回体的
 * errorMessages 字段。
 */
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
