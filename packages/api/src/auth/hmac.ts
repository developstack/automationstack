// 会话 cookie 和 Casdoor 登录 state cookie 共用的签名工具。

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const PLUS_TO_DASH = /\+/g;
const SLASH_TO_UNDERSCORE = /\//g;
const TRAILING_EQUALS = /[=]+$/;
const DASH_TO_PLUS = /-/g;
const UNDERSCORE_TO_SLASH = /_/g;
const BASE64_GROUP = 4;
const HEX_RADIX = 16;
const HEX_BYTE_WIDTH = 2;

export function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(PLUS_TO_DASH, "-")
		.replace(SLASH_TO_UNDERSCORE, "_")
		.replace(TRAILING_EQUALS, "");
}

export function fromBase64Url(value: string): Uint8Array {
	const padding = (BASE64_GROUP - (value.length % BASE64_GROUP)) % BASE64_GROUP;
	const base64 = value
		.replace(DASH_TO_PLUS, "+")
		.replace(UNDERSCORE_TO_SLASH, "/")
		.padEnd(value.length + padding, "=");
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.length !== right.length) {
		return false;
	}
	let diff = 0;
	for (let index = 0; index < left.length; index += 1) {
		// biome-ignore lint/suspicious/noBitwiseOperators: 恒定时间比较靠异或累积差异
		diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
	}
	return diff === 0;
}

export async function hmacSha256(
	data: string,
	secret: string
): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"]
	);
	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
	return new Uint8Array(signature);
}

async function sha256(value: string): Promise<Uint8Array> {
	return new Uint8Array(
		await crypto.subtle.digest("SHA-256", encoder.encode(value))
	);
}

export async function sha256Hex(value: string): Promise<string> {
	let hex = "";
	for (const byte of await sha256(value)) {
		hex += byte.toString(HEX_RADIX).padStart(HEX_BYTE_WIDTH, "0");
	}
	return hex;
}

/**
 * 常量时间比较两个字符串。先计算两边的 SHA-256，所以比较时间与长度无关。
 * 用于 webhook 密钥这类共享密钥。
 */
export async function secretsEqual(
	provided: string,
	expected: string
): Promise<boolean> {
	const [left, right] = await Promise.all([sha256(provided), sha256(expected)]);
	return timingSafeEqual(left, right);
}

/** 把 JSON 值签名为「载荷.签名」，两段都是 base64url。 */
export async function signJson(
	payload: unknown,
	secret: string
): Promise<string> {
	const encoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
	return `${encoded}.${toBase64Url(await hmacSha256(encoded, secret))}`;
}

/** 校验 signJson 的结果。签名错误或格式错误时返回 null。不检查载荷的内容。 */
export async function verifySignedJson(
	token: string,
	secret: string
): Promise<unknown> {
	const [encoded, signatureBase64, extra] = token.split(".");
	if (!(encoded && signatureBase64) || extra !== undefined) {
		return null;
	}
	try {
		const signature = fromBase64Url(signatureBase64);
		if (!timingSafeEqual(await hmacSha256(encoded, secret), signature)) {
			return null;
		}
		return JSON.parse(decoder.decode(fromBase64Url(encoded)));
	} catch {
		return null;
	}
}
