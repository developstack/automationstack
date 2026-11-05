import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import {
	checkDownloadQuery,
	checkUploadQuery,
} from "@automationstack/api/lib/file-url-signing";
import {
	contentTypeForKey,
	FILES_PATH_PREFIX,
	isSafeStorageKey,
	localPathOf,
	localStorageRoot,
	writeLocalObject,
} from "@automationstack/api/lib/local-storage";
import { env } from "@automationstack/env/server";
import type { Context, Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { parseByteRange } from "./byte-range";

const HTTP_OK = 200;
const HTTP_PARTIAL_CONTENT = 206;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_RANGE_NOT_SATISFIABLE = 416;

const MS_PER_SECOND = 1000;
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * 上传的内容由用户提供，并且与平台在同一个域名下。nosniff 让浏览器只按 Content-Type 处理它；
 * sandbox 让浏览器不执行其中的脚本。类型只有图片、视频和纯文本（attachment-policy）。
 */
const SAFE_CONTENT_HEADERS = {
	"Content-Security-Policy": "default-src 'none'; sandbox",
	"X-Content-Type-Options": "nosniff",
} as const;

function storageKeyOf(requestPath: string): string | null {
	const encoded = requestPath.slice(FILES_PATH_PREFIX.length);
	let storageKey: string;
	try {
		storageKey = encoded.split("/").map(decodeURIComponent).join("/");
	} catch {
		return null;
	}
	return isSafeStorageKey(storageKey) ? storageKey : null;
}

function encodedKey(storageKey: string): string {
	return storageKey.split("/").map(encodeURIComponent).join("/");
}

function mediaTypeOf(header: string | undefined): string | undefined {
	return header?.split(";")[0]?.trim().toLowerCase();
}

function refuse(
	c: Context,
	status: ContentfulStatusCode,
	message: string
): Response {
	return c.text(message, status);
}

/**
 * 读完并丢弃请求体。server 在读完请求体之前回应并关闭连接时，nginx 还在发送请求体，
 * 它把这个情况报告为 502，客户端看不到拒绝的原因。请求体最大 20 MiB（request-body-limit）。
 */
async function discardBody(c: Context): Promise<void> {
	const { body } = c.req.raw;
	if (body === null || body.locked) {
		return;
	}
	try {
		await pipeline(
			Readable.fromWeb(body as WebReadableStream<Uint8Array>),
			new Writable({ write: (_chunk, _encoding, callback) => callback() })
		);
	} catch {
		// 客户端中断了请求体：不需要再读。
	}
}

async function refuseUpload(
	c: Context,
	status: ContentfulStatusCode,
	message: string
): Promise<Response> {
	await discardBody(c);
	return refuse(c, status, message);
}

async function handleUpload(c: Context): Promise<Response> {
	const storageKey = storageKeyOf(c.req.path);
	if (storageKey === null) {
		return await refuseUpload(c, HTTP_NOT_FOUND, "地址不存在");
	}
	const check = checkUploadQuery(storageKey, new URL(c.req.url).searchParams);
	if (check.kind !== "ok") {
		return await refuseUpload(
			c,
			HTTP_FORBIDDEN,
			check.kind === "expired"
				? "上传地址已过期，请重新取得上传地址"
				: "上传地址的签名无效"
		);
	}
	const grant = check.value;
	if (mediaTypeOf(c.req.header("content-type")) !== grant.contentType) {
		return await refuseUpload(
			c,
			HTTP_FORBIDDEN,
			`Content-Type 必须是取得上传地址时声明的 ${grant.contentType}`
		);
	}
	const declaredLength = c.req.header("content-length");
	if (
		declaredLength !== undefined &&
		Number(declaredLength) !== grant.contentLength
	) {
		return await refuseUpload(
			c,
			HTTP_FORBIDDEN,
			`Content-Length 必须是取得上传地址时声明的 ${grant.contentLength}`
		);
	}
	const body = c.req.raw.body ?? new Blob([]).stream();
	const result = await writeLocalObject({
		body: body as WebReadableStream<Uint8Array>,
		expectedBytes: grant.contentLength,
		root: localStorageRoot(),
		storageKey,
	});
	if (result.kind === "size-mismatch") {
		return refuse(
			c,
			HTTP_BAD_REQUEST,
			`文件大小与声明的 ${grant.contentLength} 字节不同`
		);
	}
	return c.body(null, HTTP_OK);
}

/** 不会过期的地址（用例图片）可以长期缓存。有过期时间的地址只缓存到过期为止。 */
function cacheControlFor(expiresAt: number | null): string {
	if (expiresAt === null) {
		return `public, max-age=${ONE_YEAR_SECONDS}, immutable`;
	}
	const remaining = Math.max(
		0,
		expiresAt - Math.floor(Date.now() / MS_PER_SECOND)
	);
	return `private, max-age=${remaining}`;
}

async function statFile(filePath: string) {
	try {
		const info = await stat(filePath);
		return info.isFile() ? info : null;
	} catch {
		return null;
	}
}

function sendFile(
	c: Context,
	file: { path: string; size: number },
	headers: Record<string, string>
): Response {
	const range = parseByteRange(c.req.header("range"), file.size);
	if (range.kind === "unsatisfiable") {
		return c.body(null, HTTP_RANGE_NOT_SATISFIABLE, {
			...headers,
			"Content-Range": `bytes */${file.size}`,
		});
	}
	const start = range.kind === "range" ? range.start : 0;
	const end = range.kind === "range" ? range.end : file.size - 1;
	const stream =
		file.size === 0
			? new Blob([]).stream()
			: Readable.toWeb(createReadStream(file.path, { end, start }));
	const partial = range.kind === "range";
	return new Response(stream as ReadableStream, {
		headers: {
			...headers,
			"Accept-Ranges": "bytes",
			"Content-Length": String(file.size === 0 ? 0 : end - start + 1),
			...(partial
				? { "Content-Range": `bytes ${start}-${end}/${file.size}` }
				: {}),
		},
		status: partial ? HTTP_PARTIAL_CONTENT : HTTP_OK,
	});
}

async function handleDownload(c: Context): Promise<Response> {
	const storageKey = storageKeyOf(c.req.path);
	const filePath =
		storageKey === null ? null : localPathOf(localStorageRoot(), storageKey);
	if (storageKey === null || filePath === null) {
		return refuse(c, HTTP_NOT_FOUND, "文件不存在");
	}
	const check = checkDownloadQuery(storageKey, new URL(c.req.url).searchParams);
	if (check.kind !== "ok") {
		return refuse(
			c,
			HTTP_FORBIDDEN,
			check.kind === "expired" ? "下载地址已过期" : "下载地址的签名无效"
		);
	}
	const info = await statFile(filePath);
	if (info === null) {
		return refuse(c, HTTP_NOT_FOUND, "文件不存在");
	}
	const headers = {
		...SAFE_CONTENT_HEADERS,
		"Cache-Control": cacheControlFor(check.value),
		"Content-Type": contentTypeForKey(storageKey),
	};
	const accelPrefix = env.FILE_STORAGE_ACCEL_PREFIX;
	if (accelPrefix !== undefined) {
		// nginx 从同一个目录发送文件，并处理 Range、sendfile 和条件请求。
		return c.body(null, HTTP_OK, {
			...headers,
			"X-Accel-Redirect": `${accelPrefix}${encodedKey(storageKey)}`,
		});
	}
	return sendFile(c, { path: filePath, size: info.size }, headers);
}

/**
 * 本地存储的上传和下载（lib/local-storage）。地址由 server 签发，
 * 用法与 R2 的预签名地址相同：PUT 上传，GET 下载。
 */
export function registerFileRoutes(app: Hono): void {
	const route = `${FILES_PATH_PREFIX}*`;
	app.put(route, handleUpload);
	app.get(route, handleDownload);
}
