/**
 * 用例图片链接的签名校验（#63，ADR 0002）。
 *
 * 服务端的签名函数在 packages/api/src/lib/image-cdn-signature.ts。
 * 两边各有一份实现，并且用同一组测试向量（image-cdn-signature-vectors.ts）验证，
 * 所以算法必须一起修改：base64url(HMAC-SHA256(密钥, "<storageKey>:<exp>"))，不带填充。
 */
const encoder = new TextEncoder();

const BASE64URL = /^[\w-]+$/;
const BASE64_BLOCK_LENGTH = 4;

function decodeBase64Url(value: string): Uint8Array | null {
	if (!BASE64URL.test(value)) {
		return null;
	}
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
	const paddedLength =
		Math.ceil(base64.length / BASE64_BLOCK_LENGTH) * BASE64_BLOCK_LENGTH;
	try {
		const binary = atob(base64.padEnd(paddedLength, "="));
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
}

/** 签名正确时返回 true。比较由 crypto.subtle.verify 完成，耗时与签名内容无关。 */
export async function verifyImageSignature(
	storageKey: string,
	exp: number,
	signature: string,
	secret: string
): Promise<boolean> {
	const signatureBytes = decodeBase64Url(signature);
	if (signatureBytes === null) {
		return false;
	}
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["verify"]
	);
	return await crypto.subtle.verify(
		"HMAC",
		key,
		signatureBytes,
		encoder.encode(`${storageKey}:${exp}`)
	);
}
