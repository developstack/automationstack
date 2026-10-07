export const JIRA_SIGNATURE_HEADER = "x-hub-signature";

export const JIRA_SECRET_HEADER = "x-webhook-secret";

const SIGNATURE_PREFIX = "sha256=";

const encoder = new TextEncoder();

function timingSafeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) {
		return false;
	}
	let diff = 0;
	for (let index = 0; index < left.length; index += 1) {
		// biome-ignore lint/suspicious/noBitwiseOperators: 定长比较必须按位累积差异，见上
		diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
	let hex = "";
	for (const byte of new Uint8Array(buffer)) {
		hex += byte.toString(16).padStart(2, "0");
	}
	return hex;
}

export async function signWebhookBody(
	rawBody: string,
	secret: string
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		encoder.encode(rawBody)
	);
	return toHex(signature);
}

export interface VerifyJiraWebhookInput {
	rawBody: string;
	secret: string | null;
	secretHeader: string | null;
	signatureHeader: string | null;
}

export async function verifyJiraWebhook(
	input: VerifyJiraWebhookInput
): Promise<boolean> {
	const { secret } = input;
	if (secret === null || secret === "") {
		return false;
	}
	const signature = input.signatureHeader?.trim();
	if (signature !== undefined && signature !== "") {
		if (!signature.toLowerCase().startsWith(SIGNATURE_PREFIX)) {
			return false;
		}
		const expected = await signWebhookBody(input.rawBody, secret);
		return timingSafeEqual(
			signature.slice(SIGNATURE_PREFIX.length).toLowerCase(),
			expected
		);
	}
	const provided = input.secretHeader;
	if (provided === null || provided === "") {
		return false;
	}
	return timingSafeEqual(provided, secret);
}

export type JiraWebhookEvent =
	| { kind: "ignored" }
	| { kind: "invalid" }
	| { kind: "status"; issueKey: string; status: string };

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: null;
}

function readString(
	source: Record<string, unknown>,
	key: string
): string | null {
	const value = source[key];
	return typeof value === "string" && value !== "" ? value : null;
}

export function parseJiraWebhookPayload(raw: unknown): JiraWebhookEvent {
	const body = asRecord(raw);
	if (body === null) {
		return { kind: "invalid" };
	}
	const event = readString(body, "webhookEvent");
	if (event === null) {
		return { kind: "invalid" };
	}
	if (!event.startsWith("jira:issue_")) {
		return { kind: "ignored" };
	}
	const issue = asRecord(body.issue);
	const issueKey = issue === null ? null : readString(issue, "key");
	if (issueKey === null) {
		return { kind: "invalid" };
	}
	const fields = issue === null ? null : asRecord(issue.fields);
	const status = fields === null ? null : asRecord(fields.status);
	const statusName = status === null ? null : readString(status, "name");
	if (statusName === null) {
		return { kind: "ignored" };
	}
	return { issueKey, kind: "status", status: statusName };
}

export const JIRA_WEBHOOK_ROUTE = "/api/jira/webhook/:projectId";

export function jiraWebhookPath(projectId: string): string {
	return `/api/jira/webhook/${projectId}`;
}
