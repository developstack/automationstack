import {
	classifyStatus,
	classifyThrown,
	type JiraResult,
	readErrorMessage,
} from "./failure";

const REQUEST_TIMEOUT_MS = 10_000;

export function encodeBasicAuth(email: string, apiToken: string): string {
	return btoa(`${email}:${apiToken}`);
}

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

async function readJsonPayload(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

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
