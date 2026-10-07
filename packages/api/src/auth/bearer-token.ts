import { API_TOKEN_PREFIX } from "@automationstack/db/api-token";

const BEARER_SCHEME_PATTERN = /^bearer[ \t]+/i;

const TOKEN_BODY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function parseBearerToken(
	header: string | null | undefined
): string | null {
	if (!header) {
		return null;
	}
	const trimmed = header.trim();
	const scheme = BEARER_SCHEME_PATTERN.exec(trimmed);
	if (scheme === null) {
		return null;
	}
	const candidate = trimmed.slice(scheme[0].length).trim();
	if (!candidate.startsWith(API_TOKEN_PREFIX)) {
		return null;
	}
	if (!TOKEN_BODY_PATTERN.test(candidate.slice(API_TOKEN_PREFIX.length))) {
		return null;
	}
	return candidate;
}
