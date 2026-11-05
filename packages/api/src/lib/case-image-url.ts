import type { ObjectStorage } from "./object-storage-model";

const TRAILING_SLASHES = /\/+$/;

function publicCaseImageUrl(baseUrl: string, storageKey: string): string {
	const path = storageKey.split("/").map(encodeURIComponent).join("/");
	return `${baseUrl.replace(TRAILING_SLASHES, "")}/${path}`;
}

/**
 * R2 中用例图片的下载链接（#63，ADR-0003）。存储设置中有公开基础地址时，
 * 返回 R2 自定义域名上的公开链接：不带查询参数，不会过期，浏览器和边缘可以缓存。
 * 没有公开基础地址时，返回 R2 签名链接。
 * 执行页的附件不使用此函数，继续使用 R2 签名链接。
 */
export function caseImageDownloadUrl(
	storage: Pick<ObjectStorage, "presignDownload">,
	storageKey: string,
	publicBaseUrl: string | null
): Promise<string> {
	if (publicBaseUrl === null) {
		return storage.presignDownload(storageKey);
	}
	return Promise.resolve(publicCaseImageUrl(publicBaseUrl, storageKey));
}
