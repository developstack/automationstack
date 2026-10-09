import { casdoorBasicAuthorization } from "./client-auth";
import {
	type CasdoorOrganizationRecord,
	type CasdoorRoleRecord,
	type CasdoorUserRecord,
	toOrganizationRecord,
	toRoleRecord,
	toUserRecord,
} from "./management-records";
import { describeError, redactSecrets, truncateDetail } from "./redact";

/** 每个管理 API 请求的默认超时。 */
export const MANAGEMENT_TIMEOUT_MS = 10_000;

const TOKEN_PATH = "/api/login/oauth/access_token";
const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const MS_PER_SECOND = 1000;
/** token 到期前这么久就重新获取。 */
const TOKEN_REFRESH_MARGIN_MS = 60_000;
/** 响应中没有 expires_in 时，token 缓存这么久。 */
const DEFAULT_TOKEN_TTL_MS = 1_800_000;
const USERS_PAGE_SIZE = 100;
const MAX_USER_PAGES = 1000;
/** Casdoor 中全部组织对象的 owner。组织的 id 是「admin/组织名」。 */
const ORGANIZATION_OWNER = "admin";

/** 管理 API 请求失败。message 中已经删除了 client secret。 */
export class CasdoorRequestError extends Error {
	constructor(message: string, secrets: readonly string[]) {
		super(redactSecrets(message, secrets));
		this.name = "CasdoorRequestError";
	}
}

export interface ManagementClientOptions {
	/** Casdoor 的集群内地址。 */
	baseUrl: string;
	clientId: string;
	clientSecret: string;
	fetch?: typeof fetch;
	now?: () => number;
	/** 外部的取消信号，例如测试连接的总时限。 */
	signal?: AbortSignal;
	timeoutMs?: number;
}

interface Envelope {
	data: unknown;
	data2: unknown;
}

interface RawResponse {
	body: string;
	status: number;
}

function parseJson(
	body: string,
	what: string,
	secrets: readonly string[]
): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		// biome-ignore lint/style/useErrorCause: 响应体已经写入 message，解析错误本身没有更多信息
		throw new CasdoorRequestError(
			`${what} 的响应不是 JSON：${truncateDetail(body)}`,
			secrets
		);
	}
	if (typeof parsed !== "object" || parsed === null) {
		throw new CasdoorRequestError(`${what} 的响应格式错误`, secrets);
	}
	return parsed as Record<string, unknown>;
}

function tokenFailure(
	what: string,
	status: number,
	payload: Record<string, unknown>,
	secrets: readonly string[]
): CasdoorRequestError {
	const reason =
		payload.error_description ?? payload.error ?? "响应中没有 access_token";
	return new CasdoorRequestError(
		`${what} 失败：HTTP ${status}，${truncateDetail(String(reason))}`,
		secrets
	);
}

/**
 * Casdoor 管理 API 客户端（plan 021 D13、§11.6、§11.10 第 3、4 项）。
 * token 用普通 fetch 和 HTTP Basic 头获取，不用 openid-client 的 clientCredentialsGrant。
 * 对象不存在时 Casdoor 返回 status: "ok" 和 data: null：这里返回 null，与请求失败不同。
 * 所有错误信息都删除了 client secret。
 */
export class CasdoorManagementClient {
	private readonly doFetch: typeof fetch;
	private readonly now: () => number;
	private readonly options: ManagementClientOptions;
	private readonly timeoutMs: number;
	private token: { expiresAt: number; value: string } | null = null;

	constructor(options: ManagementClientOptions) {
		this.options = options;
		this.doFetch = options.fetch ?? fetch;
		this.now = options.now ?? Date.now;
		this.timeoutMs = options.timeoutMs ?? MANAGEMENT_TIMEOUT_MS;
	}

	/** 不使用缓存，重新获取 token。测试连接使用。 */
	async fetchToken(): Promise<string> {
		const what = "获取管理 token";
		const { body, status } = await this.send(
			new URL(TOKEN_PATH, this.options.baseUrl),
			{
				body: new URLSearchParams({ grant_type: "client_credentials" }),
				headers: {
					authorization: casdoorBasicAuthorization(
						this.options.clientId,
						this.options.clientSecret
					),
					"content-type": "application/x-www-form-urlencoded",
				},
				method: "POST",
			},
			what
		);
		const payload = parseJson(body, what, this.secrets);
		const accessToken = payload.access_token;
		if (status !== HTTP_OK || typeof accessToken !== "string" || !accessToken) {
			throw tokenFailure(what, status, payload, this.secrets);
		}
		const ttl =
			typeof payload.expires_in === "number"
				? payload.expires_in * MS_PER_SECOND
				: DEFAULT_TOKEN_TTL_MS;
		this.token = {
			expiresAt: this.now() + ttl - TOKEN_REFRESH_MARGIN_MS,
			value: accessToken,
		};
		return accessToken;
	}

	async getOrganization(
		name: string
	): Promise<CasdoorOrganizationRecord | null> {
		const { data } = await this.get("/api/get-organization", {
			id: `${ORGANIZATION_OWNER}/${name}`,
		});
		return toOrganizationRecord(data);
	}

	async getRole(
		owner: string,
		name: string
	): Promise<CasdoorRoleRecord | null> {
		const { data } = await this.get("/api/get-role", {
			id: `${owner}/${name}`,
		});
		return toRoleRecord(data);
	}

	/** id 的格式是「组织/用户名」。 */
	async getUser(id: string): Promise<CasdoorUserRecord | null> {
		const { data } = await this.get("/api/get-user", { id });
		return toUserRecord(data);
	}

	/** 分页读取组织中的全部用户（§11.9 T11a）。任何一页失败都抛出错误。 */
	async listUsers(owner: string): Promise<CasdoorUserRecord[]> {
		const users: CasdoorUserRecord[] = [];
		for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
			// biome-ignore lint/performance/noAwaitInLoops: 分页读取，下一页取决于上一页的结果
			const { data, data2 } = await this.get("/api/get-users", {
				owner,
				p: String(page),
				pageSize: String(USERS_PAGE_SIZE),
			});
			const rows = Array.isArray(data) ? data : [];
			for (const row of rows) {
				const user = toUserRecord(row);
				if (user !== null) {
					users.push(user);
				}
			}
			const total = typeof data2 === "number" ? data2 : users.length;
			if (rows.length === 0 || users.length >= total) {
				return users;
			}
		}
		throw new CasdoorRequestError(
			`读取组织 ${owner} 的用户失败：超过 ${MAX_USER_PAGES} 页`,
			this.secrets
		);
	}

	private get secrets(): readonly string[] {
		return [this.options.clientSecret];
	}

	private signal(): AbortSignal {
		const timeout = AbortSignal.timeout(this.timeoutMs);
		return this.options.signal
			? AbortSignal.any([timeout, this.options.signal])
			: timeout;
	}

	private async send(
		url: URL,
		init: RequestInit,
		what: string
	): Promise<RawResponse> {
		try {
			const response = await this.doFetch(url, {
				...init,
				signal: this.signal(),
			});
			return { body: await response.text(), status: response.status };
		} catch (error) {
			const reason =
				error instanceof Error && error.name === "TimeoutError"
					? `请求超时（${this.timeoutMs} 毫秒）`
					: describeError(error, this.secrets);
			// biome-ignore lint/style/useErrorCause: 原错误的 message 可能包含 secret，所以只保留删除了 secret 的文本
			throw new CasdoorRequestError(`${what} 失败：${reason}`, this.secrets);
		}
	}

	private async currentToken(): Promise<string> {
		if (this.token !== null && this.now() < this.token.expiresAt) {
			return this.token.value;
		}
		return await this.fetchToken();
	}

	private async get(
		path: string,
		query: Record<string, string>
	): Promise<Envelope> {
		const url = new URL(path, this.options.baseUrl);
		url.search = new URLSearchParams(query).toString();
		const what = `调用 ${path}`;
		const call = (bearer: string) =>
			this.send(
				url,
				{
					headers: {
						accept: "application/json",
						authorization: `Bearer ${bearer}`,
					},
				},
				what
			);
		let response = await call(await this.currentToken());
		if (response.status === HTTP_UNAUTHORIZED) {
			// Casdoor 可能已经让 token 失效：重新获取一次，只重试一次。
			response = await call(await this.fetchToken());
		}
		if (response.status !== HTTP_OK) {
			throw new CasdoorRequestError(
				`${what} 失败：HTTP ${response.status}，${truncateDetail(response.body)}`,
				this.secrets
			);
		}
		const payload = parseJson(response.body, what, this.secrets);
		if (payload.status !== "ok") {
			throw new CasdoorRequestError(
				`${what} 失败：${truncateDetail(String(payload.msg ?? payload.status))}`,
				this.secrets
			);
		}
		return { data: payload.data, data2: payload.data2 };
	}
}
