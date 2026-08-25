import { IngestHttpError } from "./errors";

/**
 * 唯一的网络层。**只有 fetch，没有 S3 SDK**（§7.3 / D28）：附件走预签名 PUT，
 * 三种语言的 SDK 都只需要一个 HTTP 客户端。引一个 S3 SDK 会给用户的构建加十几兆、
 * 还会跟他自己那份撞版本，而它换来的能力这里一样都用不上。
 */

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
	baseUrl: string;
	fetchImpl?: FetchLike;
	/** 含首次尝试在内的总次数。 */
	maxAttempts?: number;
	sleep?: (ms: number) => Promise<void>;
	timeoutMs?: number;
	token: string;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_BASE_DELAY_MS = 500;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_FLOOR = 500;

/**
 * 只重试「再试一次可能就好了」的那些：网络层异常、429、5xx。
 *
 * 4xx **一律不重试**——请求体本身有问题，重发一百次还是同一条 400，
 * 而重试会把「SDK 发错了」伪装成「网络不稳」，人在日志里看到的是超时。
 * 重试之所以安全，是因为幂等键在请求体里、跨重试是同一个（§5.2）：
 * 服务端要么整轮重跑（`completedAt is null`），要么直接返回缓存的对账单。
 */
function isRetriableStatus(status: number): boolean {
	return status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERROR_FLOOR;
}

const defaultSleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

/** 服务端的错误体固定是 `{ error, message }`；取不出来就返回 null，绝不自己编一句。 */
async function readServerMessage(response: Response): Promise<string | null> {
	try {
		const parsed: unknown = await response.json();
		if (
			typeof parsed === "object" &&
			parsed !== null &&
			"message" in parsed &&
			typeof (parsed as { message: unknown }).message === "string"
		) {
			return (parsed as { message: string }).message;
		}
	} catch {
		// 体不是 JSON（反代返回的 HTML 错误页之类）。这时没有服务端原文可透传，
		// 编一句会让人以为那是平台说的话——宁可只报状态码。
	}
	return null;
}

export class IngestHttpClient {
	private readonly baseUrl: string;
	private readonly fetchImpl: FetchLike;
	private readonly maxAttempts: number;
	private readonly sleep: (ms: number) => Promise<void>;
	private readonly timeoutMs: number;
	private readonly token: string;

	constructor(options: HttpClientOptions) {
		this.baseUrl = options.baseUrl;
		this.fetchImpl = options.fetchImpl ?? fetch;
		this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
		this.sleep = options.sleep ?? defaultSleep;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.token = options.token;
	}

	/** ingest 端点。返回体由调用方按契约当成对应的对账单类型用。 */
	async postJson<TResponse>(path: string, body: unknown): Promise<TResponse> {
		const url = `${this.baseUrl}${path}`;
		const response = await this.send(url, {
			body: JSON.stringify(body),
			headers: {
				authorization: `Bearer ${this.token}`,
				"content-type": "application/json",
			},
			method: "POST",
		});
		return (await response.json()) as TResponse;
	}

	/**
	 * 直传 R2 的那一步。**不带 Authorization**：签名已经在 URL 里，多带一个
	 * Authorization 头会让部分 S3 兼容实现按「双重鉴权」直接 400。
	 * `contentType` 必须逐字用 presign 回来的值（它进了签名的 `SignedHeaders`）。
	 */
	async putBinary(
		url: string,
		contentType: string,
		body: Uint8Array
	): Promise<void> {
		await this.send(url, {
			body,
			headers: { "content-type": contentType },
			method: "PUT",
		});
	}

	private async send(url: string, init: RequestInit): Promise<Response> {
		let lastError: unknown;
		for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
			// biome-ignore lint/performance/noAwaitInLoops: 重试本来就是串行的，并发重试等于放大故障
			const outcome = await this.attempt(url, init);
			if (outcome.kind === "ok") {
				return outcome.response;
			}
			lastError = outcome.error;
			if (!outcome.retriable || attempt === this.maxAttempts) {
				throw outcome.error;
			}
			await this.sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
		}
		// 循环至少跑一次且每条分支都 return/throw，这里不可达；写出来是为了让
		// 「maxAttempts 被配成 0」这种配置错误有一句能读懂的话，而不是 undefined。
		throw (
			lastError ?? new Error(`${url} 一次都没有尝试（maxAttempts 配成了 0？）`)
		);
	}

	private async attempt(
		url: string,
		init: RequestInit
	): Promise<AttemptOutcome> {
		try {
			const response = await this.fetchImpl(url, {
				...init,
				signal: AbortSignal.timeout(this.timeoutMs),
			});
			if (response.ok) {
				return { kind: "ok", response };
			}
			const serverMessage = await readServerMessage(response);
			return {
				error: new IngestHttpError(response.status, serverMessage, url),
				kind: "failed",
				retriable: isRetriableStatus(response.status),
			};
		} catch (error) {
			// 连不上、DNS 失败、超时。这些正是重试存在的理由。
			return { error, kind: "failed", retriable: true };
		}
	}
}

type AttemptOutcome =
	| { error: unknown; kind: "failed"; retriable: boolean }
	| { kind: "ok"; response: Response };
