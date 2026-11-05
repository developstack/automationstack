import { beforeEach, describe, expect, it, vi } from "vitest";

import { caseImageDownloadUrl } from "./case-image-url";

const BASE_URL = "https://img.trendf.top";
const STORAGE_KEY = "test-cases/project-1/case-1/image-1.png";
const R2_URL = "https://r2.example.com/signed?X-Amz-Signature=abc";

const storage = {
	presignDownload: vi.fn((_storageKey: string) => Promise.resolve(R2_URL)),
};

beforeEach(() => {
	storage.presignDownload.mockClear();
});

describe("caseImageDownloadUrl：没有公开基础地址", () => {
	it("返回 R2 签名链接", async () => {
		await expect(
			caseImageDownloadUrl(storage, STORAGE_KEY, null)
		).resolves.toBe(R2_URL);
		expect(storage.presignDownload).toHaveBeenCalledWith(STORAGE_KEY);
	});
});

describe("caseImageDownloadUrl：有公开基础地址", () => {
	it.each([
		["基础地址", BASE_URL, STORAGE_KEY, `${BASE_URL}/${STORAGE_KEY}`],
		[
			"基础地址末尾的 / 被忽略",
			`${BASE_URL}//`,
			STORAGE_KEY,
			`${BASE_URL}/${STORAGE_KEY}`,
		],
		[
			"对象键的每一段做 URL 编码，/ 保留",
			BASE_URL,
			"test-cases/p/c/图片 1#?.jpg",
			`${BASE_URL}/test-cases/p/c/%E5%9B%BE%E7%89%87%201%23%3F.jpg`,
		],
	])(
		"%s：公开链接，不带查询参数，不调用 R2 签名",
		async (_name, baseUrl, storageKey, expected) => {
			const url = await caseImageDownloadUrl(storage, storageKey, baseUrl);
			expect(url).toBe(expected);
			expect(new URL(url).search).toBe("");
			expect(storage.presignDownload).not.toHaveBeenCalled();
		}
	);
});
