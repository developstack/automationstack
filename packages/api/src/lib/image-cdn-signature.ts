/**
 * 用例图片链接的签名（#63，ADR 0002）。apps/image-worker 用同一组测试向量
 * （image-cdn-signature-vectors.json）校验自己的实现，两边的算法必须一起修改。
 *
 * 签名 = base64url(HMAC-SHA256(密钥, "<storageKey>:<exp>"))，不带填充。
 * 密钥按 UTF-8 字节使用，不做 base64 解码。
 */
const encoder = new TextEncoder();

export async function signImageCdnPath(
	storageKey: string,
	exp: number,
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
		encoder.encode(`${storageKey}:${exp}`)
	);
	return Buffer.from(signature).toString("base64url");
}
