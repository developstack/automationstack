import { describe, expect, it } from "vitest";

import { IMAGE_CDN_SIGNATURE_VECTORS } from "../../../packages/api/src/lib/image-cdn-signature-vectors";
import { verifyImageSignature } from "./signature";

const [vector] = IMAGE_CDN_SIGNATURE_VECTORS;
if (vector === undefined) {
	throw new Error("缺少签名测试向量");
}

describe("verifyImageSignature：与服务端共用的测试向量", () => {
	it.each(IMAGE_CDN_SIGNATURE_VECTORS)(
		"$storageKey 在 $exp 的签名有效",
		async ({ exp, secret, signature, storageKey }) => {
			await expect(
				verifyImageSignature(storageKey, exp, signature, secret)
			).resolves.toBe(true);
		}
	);

	it.each([
		["修改一个字符的签名", { signature: `A${vector.signature.slice(1)}` }],
		["不同的 exp", { exp: vector.exp + 1 }],
		["不同的对象键", { storageKey: `${vector.storageKey}x` }],
		["不同的密钥", { secret: `${vector.secret}x` }],
		["空签名", { signature: "" }],
		["不是 base64url 的签名", { signature: "abc+/=" }],
		["长度不合法的 base64url", { signature: "a" }],
	])("%s：无效", async (_name, override) => {
		const { exp, secret, signature, storageKey } = { ...vector, ...override };
		await expect(
			verifyImageSignature(storageKey, exp, signature, secret)
		).resolves.toBe(false);
	});
});
