import { IngestHttpError } from "./errors.js";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
	baseUrl: string;
	fetchImpl?: FetchLike;
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

function isRetriableStatus(status: number): boolean {
	return status === HTTP_TOO_MANY_REQUESTS || status >= HTTP_SERVER_ERROR_FLOOR;
}

const defaultSleep = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		setTimeout(resolve, ms);
	});

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
		// biome-ignore lint/suspicious/noEmptyBlockStatements: intentional
	} catch {}
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
			return { error, kind: "failed", retriable: true };
		}
	}
}

type AttemptOutcome =
	| { error: unknown; kind: "failed"; retriable: boolean }
	| { kind: "ok"; response: Response };
