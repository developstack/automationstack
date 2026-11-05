import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@automationstack/env/server";

const SIGNATURE_LABEL = "automationstack-file-url-v1";

const MS_PER_SECOND = 1000;

const DIGITS = /^\d+$/;

/** 上传地址允许的对象：类型和准确的字节数。 */
export interface UploadGrant {
	contentLength: number;
	contentType: string;
	/** Unix 时间，单位秒。 */
	expiresAt: number;
}

export type SignatureCheck<T> =
	| { kind: "expired" }
	| { kind: "invalid" }
	| { kind: "ok"; value: T };

function sign(parts: readonly string[]): string {
	return createHmac("sha256", env.SESSION_SECRET)
		.update([SIGNATURE_LABEL, ...parts].join("\n"))
		.digest("base64url");
}

function sameSignature(expected: string, actual: string | null): boolean {
	if (actual === null) {
		return false;
	}
	const left = Buffer.from(expected);
	const right = Buffer.from(actual);
	return left.length === right.length && timingSafeEqual(left, right);
}

function nowSeconds(): number {
	return Math.floor(Date.now() / MS_PER_SECOND);
}

function readInteger(value: string | null): number | null {
	if (value === null || !DIGITS.test(value)) {
		return null;
	}
	return Number(value);
}

/** 上传地址的查询参数。签名包含对象键、类型、准确的字节数和过期时间。 */
export function uploadQuery(storageKey: string, grant: UploadGrant): string {
	const signature = sign([
		"PUT",
		storageKey,
		grant.contentType,
		String(grant.contentLength),
		String(grant.expiresAt),
	]);
	return new URLSearchParams({
		expires: String(grant.expiresAt),
		signature,
		size: String(grant.contentLength),
		type: grant.contentType,
	}).toString();
}

export function checkUploadQuery(
	storageKey: string,
	query: URLSearchParams
): SignatureCheck<UploadGrant> {
	const expiresAt = readInteger(query.get("expires"));
	const contentLength = readInteger(query.get("size"));
	const contentType = query.get("type");
	if (expiresAt === null || contentLength === null || contentType === null) {
		return { kind: "invalid" };
	}
	const expected = sign([
		"PUT",
		storageKey,
		contentType,
		String(contentLength),
		String(expiresAt),
	]);
	if (!sameSignature(expected, query.get("signature"))) {
		return { kind: "invalid" };
	}
	if (expiresAt < nowSeconds()) {
		return { kind: "expired" };
	}
	return { kind: "ok", value: { contentLength, contentType, expiresAt } };
}

/**
 * 下载地址的查询参数。expiresAt 为 null 时，地址不会过期：用例图片使用这种地址，
 * 所以浏览器可以长期缓存它。安全性与 R2 的公开链接（ADR-0003）相同：对象键包含随机 UUID。
 */
export function downloadQuery(
	storageKey: string,
	expiresAt: number | null
): string {
	const expires = expiresAt === null ? "" : String(expiresAt);
	const signature = sign(["GET", storageKey, expires]);
	const params = new URLSearchParams();
	if (expiresAt !== null) {
		params.set("expires", expires);
	}
	params.set("signature", signature);
	return params.toString();
}

/** 检查下载地址。value 是过期时间（Unix 秒），null 表示不会过期。 */
export function checkDownloadQuery(
	storageKey: string,
	query: URLSearchParams
): SignatureCheck<number | null> {
	const rawExpires = query.get("expires");
	const expiresAt = rawExpires === null ? null : readInteger(rawExpires);
	if (rawExpires !== null && expiresAt === null) {
		return { kind: "invalid" };
	}
	const expected = sign(["GET", storageKey, rawExpires ?? ""]);
	if (!sameSignature(expected, query.get("signature"))) {
		return { kind: "invalid" };
	}
	if (expiresAt !== null && expiresAt < nowSeconds()) {
		return { kind: "expired" };
	}
	return { kind: "ok", value: expiresAt };
}

/**
 * 有过期时间的下载地址的过期时间：取整到 ttl 的倍数，再加一个 ttl。
 * 同一个 ttl 时间段内生成的地址完全相同，所以浏览器可以缓存它。地址的有效期在 ttl 和 2 × ttl 之间。
 */
export function roundedExpiry(ttlSeconds: number): number {
	const now = nowSeconds();
	return now - (now % ttlSeconds) + 2 * ttlSeconds;
}

export function secondsFromNow(seconds: number): number {
	return nowSeconds() + seconds;
}
