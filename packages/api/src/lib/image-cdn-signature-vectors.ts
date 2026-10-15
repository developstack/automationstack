/**
 * 用例图片签名的测试向量（#63）。服务端（image-cdn-signature.test.ts）和
 * apps/image-worker（signature.test.ts）的测试都使用这一组值。
 * signature 由 Node 的 crypto.createHmac("sha256", secret) 独立算出。
 */
export interface ImageCdnSignatureVector {
	exp: number;
	secret: string;
	signature: string;
	storageKey: string;
}

export const IMAGE_CDN_SIGNATURE_VECTORS: readonly ImageCdnSignatureVector[] = [
	{
		exp: 1_767_232_800,
		secret: "0123456789abcdef0123456789abcdef",
		signature: "pc7hgzhGlE0CAmdZgPY2guMlmGg2acj6TtFQFKVXwMY",
		storageKey:
			"test-cases/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png",
	},
	{
		exp: 1_790_000_000,
		secret: "r8Jd1pQ5uX2mZ7vN4kL0tY9wB3sE6hGaFcIoUeRzMxQ=",
		signature: "8VkZ_FzXTUi4FB_EKFY9bIpB19tbMWoQfChHV22o-og",
		storageKey:
			"test-cases/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp",
	},
	{
		exp: 4_102_444_800,
		secret: "secret-with-ünïcödé-characters-0123456789",
		signature: "fx-chhlPItatZQ63WxjxVQw20mXXSLFsMRUpUvhp2ho",
		storageKey: "test-cases/p/c/图片 1.jpg",
	},
];
