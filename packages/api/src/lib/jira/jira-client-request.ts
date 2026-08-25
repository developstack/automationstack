import {
	classifyStatus,
	classifyThrown,
	type JiraResult,
	readErrorMessage,
} from "./failure";

/**
 * Jira REST 调用的**传输层**：拼 URL、带认证头、卡超时、把一次 HTTP 往返
 * 折算成 `JiraResult`。
 *
 * 与 `./jira-client-operations.ts` 分开，是因为两边变化的原因不同：这里只会
 * 因为「怎么发请求」而改（超时、认证方式、错误分类），那边只会因为
 * 「Jira 的哪个端点、返回体长什么样」而改。原先它们同挤在 `createJiraClient`
 * 的闭包里，于是任何一侧的改动都得先读完另一侧才敢下手。
 *
 * 与 `./client.ts` 一样，**失败一律是返回值不是异常**（D9 的延伸）：
 * 调用方要能把「issue 没建成」和「结论没记上」分开处理，异常会把这两件事
 * 混成同一个 500。
 */

/** 单次请求的超时。Jira Cloud 正常在 1s 内返回，10s 还没回基本就是挂了。 */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Basic 凭据编码。
 *
 * 用 `btoa` 而不是 `Buffer`：与 `packages/db/src/secret-box.ts` 同理，
 * 这一层不引入 node 专有 API。email 与 token 都是 ASCII，不需要处理多字节。
 */
export function encodeBasicAuth(email: string, apiToken: string): string {
	return btoa(`${email}:${apiToken}`);
}

/**
 * 一次客户端会话里**恒定不变**的两样东西。
 *
 * 单独成一个类型而不是各传两个字符串：`authorization` 是由凭据算出来的，
 * 和 `siteUrl` 必须成对出现——拆成两个参数，迟早出现「拿 A 站的地址配 B 站的
 * 凭据」这种只在运行时才炸的调用。⚠️ 这个值带着可解码的凭据，
 * 不许进日志、不许进任何返回值。
 */
export interface JiraTransport {
	authorization: string;
	siteUrl: string;
}

export interface JiraRequestOptions {
	body?: unknown;
	method: "GET" | "POST";
	path: string;
}

function buildRequestInit(
	transport: JiraTransport,
	requestOptions: JiraRequestOptions
): RequestInit {
	return {
		body:
			requestOptions.body === undefined
				? undefined
				: JSON.stringify(requestOptions.body),
		headers: {
			accept: "application/json",
			authorization: transport.authorization,
			"content-type": "application/json",
		},
		method: requestOptions.method,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	};
}

/**
 * 读响应体。
 *
 * 站点地址填错时 Jira 可能返回 HTML 登录页，JSON 解析会炸——先在这里兜住
 * 折算成 null，让调用方按 HTTP 状态分类，而不是让解析异常冒到业务层。
 */
async function readJsonPayload(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

/**
 * 发一次请求并把返回体交给 `parse` 折算。
 *
 * `parse` 返回 null 表示**结构不是我们认识的样子**（多半是 `siteUrl` 指到了
 * 别的站点），这被归成 `invalid-response` 而不是让调用方拿到一个半空对象。
 */
export async function sendJiraRequest<T>(
	transport: JiraTransport,
	requestOptions: JiraRequestOptions,
	parse: (payload: unknown) => T | null
): Promise<JiraResult<T>> {
	let response: Response;
	try {
		response = await fetch(
			`${transport.siteUrl}${requestOptions.path}`,
			buildRequestInit(transport, requestOptions)
		);
	} catch (error) {
		return { failure: classifyThrown(error), ok: false };
	}
	const payload = await readJsonPayload(response);
	if (!response.ok) {
		return {
			failure: {
				kind: classifyStatus(response.status),
				message: readErrorMessage(payload),
			},
			ok: false,
		};
	}
	const value = parse(payload);
	if (value === null) {
		return {
			failure: { kind: "invalid-response", message: null },
			ok: false,
		};
	}
	return { ok: true, value };
}
