// 会话 cookie 的签名工具。

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const PLUS_TO_DASH = /\+/g;
const SLASH_TO_UNDERSCORE = /\//g;
const TRAILING_EQUALS = /[=]+$/;
const DASH_TO_PLUS = /-/g;
const UNDERSCORE_TO_SLASH = /_/g;
const BASE64_GROUP = 4;

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
