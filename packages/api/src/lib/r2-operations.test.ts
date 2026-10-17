import { describe, expect, it, vi } from "vitest";

import { createR2Client, presignR2Upload } from "./r2-operations";

vi.mock("@automationstack/env/server", () => ({
	env: {
		R2_ACCESS_KEY_ID: "test-access-key",
		R2_SECRET_ACCESS_KEY: "test-secret-key",
	},
}));

const STORAGE_KEY = "test-cases/p/c/a.png";

/** 签发一个上传地址。只在本地计算签名，不发出请求。 */
async function presignedUploadUrl(contentLength: number): Promise<URL> {
	const client = createR2Client("https://account.r2.example.test");
	return new URL(
		await presignR2Upload(client, "bucket", STORAGE_KEY, {
			contentLength,
			contentType: "image/png",
		})
	);
}

describe("presignR2Upload：上传地址只接受声明的类型和大小", () => {
	it("signs the content type and the exact content length, for 5 minutes", async () => {
		const url = await presignedUploadUrl(2048);
		expect(url.pathname).toBe(`/bucket/${STORAGE_KEY}`);
		expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(
			expect.arrayContaining(["content-length", "content-type", "host"])
		);
		expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
	});

	it("signs the declared size: another size gives another signature at the same time", async () => {
		vi.useFakeTimers({
			now: Date.parse("2026-10-18T08:00:00Z"),
			toFake: ["Date"],
		});
		try {
			const [first, same, larger] = await Promise.all(
				[2048, 2048, 2049].map(presignedUploadUrl)
			);
			const signature = (url?: URL) => url?.searchParams.get("X-Amz-Signature");
			expect(signature(same)).toBe(signature(first));
			expect(signature(larger)).not.toBe(signature(first));
		} finally {
			vi.useRealTimers();
		}
	});
});
