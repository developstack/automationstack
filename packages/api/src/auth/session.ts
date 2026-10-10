import {
	fromBase64Url,
	hmacSha256 as sign,
	timingSafeEqual,
	toBase64Url,
} from "./hmac";

export const SESSION_COOKIE = "automationstack_session";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const SECONDS_PER_DAY = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY;
const SESSION_TTL_DAYS = 7;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * SECONDS_PER_DAY;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * MS_PER_SECOND;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface SessionPayload {
	exp: number;
	iat: number;
	sub: string;
}

export async function createSessionToken(
	userId: string,
	secret: string
): Promise<string> {
	const now = Date.now();
	const payload: SessionPayload = {
		exp: now + SESSION_TTL_MS,
		iat: now,
		sub: userId,
	};
	const encoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
	return `${encoded}.${toBase64Url(await sign(encoded, secret))}`;
}

function parsePayload(encoded: string): SessionPayload | null {
	try {
		const raw: unknown = JSON.parse(decoder.decode(fromBase64Url(encoded)));
		if (typeof raw !== "object" || raw === null) {
			return null;
		}
		const payload = raw as Partial<SessionPayload>;
		if (typeof payload.sub !== "string" || typeof payload.exp !== "number") {
			return null;
		}
		return { exp: payload.exp, iat: payload.iat ?? 0, sub: payload.sub };
	} catch {
		return null;
	}
}

export async function verifySessionToken(
	token: string,
	secret: string
): Promise<string | null> {
	const [encoded, signatureBase64] = token.split(".");
	if (!(encoded && signatureBase64)) {
		return null;
	}
	let signature: Uint8Array;
	try {
		signature = fromBase64Url(signatureBase64);
	} catch {
		return null;
	}
	if (!timingSafeEqual(await sign(encoded, secret), signature)) {
		return null;
	}
	const payload = parsePayload(encoded);
	if (payload === null || payload.exp <= Date.now()) {
		return null;
	}
	return payload.sub;
}

export function readCookieHeader(
	header: string | null | undefined,
	name: string
): string | null {
	if (!header) {
		return null;
	}
	for (const part of header.split(";")) {
		const index = part.indexOf("=");
		if (index === -1) {
			continue;
		}
		if (part.slice(0, index).trim() === name) {
			return part.slice(index + 1).trim() || null;
		}
	}
	return null;
}

export function sessionCookieHeader(
	token: string | null,
	secure: boolean
): string {
	const base = `${SESSION_COOKIE}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax`;
	const life = token === null ? "Max-Age=0" : `Max-Age=${SESSION_TTL_SECONDS}`;
	return `${base}; ${life}${secure ? "; Secure" : ""}`;
}
