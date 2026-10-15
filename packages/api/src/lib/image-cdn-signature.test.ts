import { describe, expect, it } from "vitest";

import { signImageCdnPath } from "./image-cdn-signature";
import { IMAGE_CDN_SIGNATURE_VECTORS } from "./image-cdn-signature-vectors";

describe("signImageCdnPath：与 apps/image-worker 共用的测试向量", () => {
	it.each(IMAGE_CDN_SIGNATURE_VECTORS)(
		"$storageKey 在 $exp 的签名",
		async ({ exp, secret, signature, storageKey }) => {
			await expect(signImageCdnPath(storageKey, exp, secret)).resolves.toBe(
				signature
			);
		}
	);
});
