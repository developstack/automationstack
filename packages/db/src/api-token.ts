export const API_TOKEN_PREFIX = "as_";

export const API_TOKEN_DISPLAY_PREFIX_LENGTH = 11;

export const API_TOKEN_LAST_USED_THROTTLE_SECONDS = 60;

const TOKEN_RANDOM_BYTES = 32;

const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replaceAll("=", "");
}

function toHex(bytes: Uint8Array): string {
	let hex = "";
	for (const byte of bytes) {
		hex += byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, "0");
	}
	return hex;
}

export async function hashApiToken(plaintext: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		encoder.encode(plaintext)
	);
	return toHex(new Uint8Array(digest));
}

export function extractApiTokenPrefix(plaintext: string): string {
	return plaintext.slice(0, API_TOKEN_DISPLAY_PREFIX_LENGTH);
}

export interface GeneratedApiToken {
	plaintext: string;
	prefix: string;
	tokenHash: string;
}

export async function generateApiToken(): Promise<GeneratedApiToken> {
	const random = crypto.getRandomValues(new Uint8Array(TOKEN_RANDOM_BYTES));
	const plaintext = `${API_TOKEN_PREFIX}${toBase64Url(random)}`;
	return {
		plaintext,
		prefix: extractApiTokenPrefix(plaintext),
		tokenHash: await hashApiToken(plaintext),
	};
}
