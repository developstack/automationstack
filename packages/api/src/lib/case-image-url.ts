import { env } from "@automationstack/env/server";

import { signImageCdnPath } from "./image-cdn-signature";
import type { R2Storage } from "./r2";

const SECONDS_PER_HOUR = 3600;
const MILLISECONDS_PER_SECOND = 1000;
/** 链接在签发时间所在小时之后的第二个整点过期，所以有效期在 1 到 2 小时之间。 */
const EXPIRY_HOURS_AFTER_CURRENT_HOUR = 2;
const TRAILING_SLASHES = /\/+$/;

interface ImageCdnConfig {
	baseUrl: string;
	signingSecret: string;
}

function resolveImageCdnConfig(): ImageCdnConfig | null {
	const baseUrl = env.IMAGE_CDN_BASE_URL;
	const signingSecret = env.IMAGE_CDN_SIGNING_SECRET;
	if (!(baseUrl && signingSecret)) {
		return null;
	}
	return { baseUrl: baseUrl.replace(TRAILING_SLASHES, ""), signingSecret };
}

/**
 * exp 是下一个整点再加一小时（unix 秒）。同一个小时内签发的链接相同，
 * 浏览器和 Worker 的边缘缓存都可以复用。
 */
function imageCdnExpiry(now: Date): number {
	const currentHour = Math.floor(
		now.getTime() / MILLISECONDS_PER_SECOND / SECONDS_PER_HOUR
	);
	return (currentHour + EXPIRY_HOURS_AFTER_CURRENT_HOUR) * SECONDS_PER_HOUR;
}

async function buildImageCdnUrl(
	config: ImageCdnConfig,
	storageKey: string,
	now: Date
): Promise<string> {
	const exp = imageCdnExpiry(now);
	const signature = await signImageCdnPath(
		storageKey,
		exp,
		config.signingSecret
	);
	const path = storageKey.split("/").map(encodeURIComponent).join("/");
	return `${config.baseUrl}/${path}?exp=${exp}&sig=${signature}`;
}

/**
 * 用例图片的下载链接（#63，ADR 0002）。IMAGE_CDN_BASE_URL 和
 * IMAGE_CDN_SIGNING_SECRET 都配置时返回 Worker 链接，否则返回 R2 签名链接。
 * 执行页的附件不使用此函数，继续使用 R2 签名链接。
 */
export function presignCaseImageDownload(
	storage: Pick<R2Storage, "presignDownload">,
	storageKey: string,
	now: Date = new Date()
): Promise<string> {
	const config = resolveImageCdnConfig();
	if (config === null) {
		return storage.presignDownload(storageKey);
	}
	return buildImageCdnUrl(config, storageKey, now);
}
