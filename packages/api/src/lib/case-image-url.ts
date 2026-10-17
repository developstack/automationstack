import { env } from "@automationstack/env/server";

import type { R2Storage } from "./r2";

const TRAILING_SLASHES = /\/+$/;

function publicCaseImageUrl(baseUrl: string, storageKey: string): string {
	const path = storageKey.split("/").map(encodeURIComponent).join("/");
	return `${baseUrl.replace(TRAILING_SLASHES, "")}/${path}`;
}

/**
 * 用例图片的下载链接（#63，ADR-0003）。配置了 IMAGE_PUBLIC_BASE_URL 时，
 * 返回 R2 自定义域名上的公开链接：不带查询参数，不会过期，浏览器和边缘可以缓存。
 * 没有配置时，返回 R2 签名链接。
 * 执行页的附件不使用此函数，继续使用 R2 签名链接。
 */
export function caseImageDownloadUrl(
	storage: Pick<R2Storage, "presignDownload">,
	storageKey: string
): Promise<string> {
	const baseUrl = env.IMAGE_PUBLIC_BASE_URL;
	if (baseUrl === undefined) {
		return storage.presignDownload(storageKey);
	}
	return Promise.resolve(publicCaseImageUrl(baseUrl, storageKey));
}
