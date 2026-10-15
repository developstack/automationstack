import { beforeEach, describe, expect, it, vi } from "vitest";

import { presignCaseImageDownload } from "./case-image-url";
import { signImageCdnPath } from "./image-cdn-signature";

const mocks = vi.hoisted(() => ({
	env: {} as {
		IMAGE_CDN_BASE_URL?: string;
		IMAGE_CDN_SIGNING_SECRET?: string;
	},
}));

vi.mock("@automationstack/env/server", () => ({ env: mocks.env }));

const BASE_URL = "https://img.trendf.top";
const SECRET = "0123456789abcdef0123456789abcdef";
const STORAGE_KEY = "test-cases/project-1/case-1/image-1.png";
const R2_URL = "https://r2.example.com/signed?X-Amz-Signature=abc";

/** 2026-10-15T10:00:00Z，整点。 */
const HOUR_START = new Date("2026-10-15T10:00:00Z");
const HOUR_START_SECONDS = HOUR_START.getTime() / 1000;

const storage = {
	presignDownload: vi.fn((_storageKey: string) => Promise.resolve(R2_URL)),
};

function at(offsetSeconds: number): Date {
	return new Date(HOUR_START.getTime() + offsetSeconds * 1000);
}

function configure(values: typeof mocks.env): void {
	mocks.env.IMAGE_CDN_BASE_URL = values.IMAGE_CDN_BASE_URL;
	mocks.env.IMAGE_CDN_SIGNING_SECRET = values.IMAGE_CDN_SIGNING_SECRET;
}

beforeEach(() => {
	storage.presignDownload.mockClear();
});

describe("presignCaseImageDownload：缺少任何一个变量时使用 R2 签名链接", () => {
	it.each([
		["两个都没有", {}],
		["只有 IMAGE_CDN_BASE_URL", { IMAGE_CDN_BASE_URL: BASE_URL }],
		["只有 IMAGE_CDN_SIGNING_SECRET", { IMAGE_CDN_SIGNING_SECRET: SECRET }],
	])("%s", async (_name, values) => {
		configure(values);
		await expect(presignCaseImageDownload(storage, STORAGE_KEY)).resolves.toBe(
			R2_URL
		);
		expect(storage.presignDownload).toHaveBeenCalledWith(STORAGE_KEY);
	});
});

describe("presignCaseImageDownload：两个变量都配置时使用 Worker 链接", () => {
	beforeEach(() => {
		configure({
			IMAGE_CDN_BASE_URL: `${BASE_URL}/`,
			IMAGE_CDN_SIGNING_SECRET: SECRET,
		});
	});

	it("链接以 IMAGE_CDN_BASE_URL 开头，签名覆盖对象键和 exp，不调用 R2", async () => {
		const exp = HOUR_START_SECONDS + 2 * 3600;
		const signature = await signImageCdnPath(STORAGE_KEY, exp, SECRET);
		await expect(
			presignCaseImageDownload(storage, STORAGE_KEY, at(0))
		).resolves.toBe(`${BASE_URL}/${STORAGE_KEY}?exp=${exp}&sig=${signature}`);
		expect(storage.presignDownload).not.toHaveBeenCalled();
	});

	it.each([
		["整点", 0, 2],
		["同一个小时的最后一秒", 3599, 2],
		["下一个整点", 3600, 3],
	])("%s签发：exp 是下一个整点再加一小时", async (_name, offset, hours) => {
		const url = await presignCaseImageDownload(
			storage,
			STORAGE_KEY,
			at(offset)
		);
		expect(new URL(url).searchParams.get("exp")).toBe(
			String(HOUR_START_SECONDS + hours * 3600)
		);
	});

	it("同一个小时内两次签发的链接相同", async () => {
		const first = await presignCaseImageDownload(storage, STORAGE_KEY, at(5));
		const second = await presignCaseImageDownload(
			storage,
			STORAGE_KEY,
			at(3000)
		);
		expect(second).toBe(first);
	});

	it("对象键的每一段做 URL 编码，斜杠保留", async () => {
		const url = await presignCaseImageDownload(
			storage,
			"test-cases/p/c/图片 1.jpg",
			at(0)
		);
		expect(new URL(url).pathname).toBe(
			"/test-cases/p/c/%E5%9B%BE%E7%89%87%201.jpg"
		);
	});
});
