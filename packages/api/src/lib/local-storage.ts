import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { env } from "@automationstack/env/server";

import type { AttachmentObjectHead } from "./attachment-ingest";
import {
	DOWNLOAD_URL_TTL_SECONDS,
	EXTENSION_BY_CONTENT_TYPE,
	UPLOAD_URL_TTL_SECONDS,
} from "./attachment-policy";
import {
	downloadQuery,
	roundedExpiry,
	secondsFromNow,
	uploadQuery,
} from "./file-url-signing";
import type { ObjectStorage } from "./object-storage-model";
import { getRequestOrigin } from "./request-origin";

/** 本地文件的上传地址和下载地址的路径前缀。server 在这个路径上处理上传和下载。 */
export const FILES_PATH_PREFIX = "/files/";

const FALLBACK_CONTENT_TYPE = "application/octet-stream";

/** 对象键的每一段只能有字母、数字、点、下划线和连字符，并且不能以点开始。所以 .. 不能出现。 */
const SAFE_STORAGE_KEY = /^[A-Za-z0-9_-][\w.-]*(?:\/[A-Za-z0-9_-][\w.-]*)*$/;

const CONTENT_TYPE_BY_EXTENSION: ReadonlyMap<string, string> = new Map(
	Object.entries(EXTENSION_BY_CONTENT_TYPE).map(([contentType, extension]) => [
		extension,
		contentType,
	])
);

export function isSafeStorageKey(storageKey: string): boolean {
	return SAFE_STORAGE_KEY.test(storageKey);
}

/** 本地文件的类型由扩展名得出。上传时 server 检查请求的类型，所以它与签发的类型相同。 */
export function contentTypeForKey(storageKey: string): string {
	const extension = path.extname(storageKey).slice(1).toLowerCase();
	return CONTENT_TYPE_BY_EXTENSION.get(extension) ?? FALLBACK_CONTENT_TYPE;
}

export function localStorageRoot(): string {
	return path.resolve(
		env.FILE_STORAGE_DIR ?? path.join(process.cwd(), ".data", "files")
	);
}

/** 对象键在本地目录中的路径。对象键不安全时返回 null。 */
export function localPathOf(root: string, storageKey: string): string | null {
	if (!isSafeStorageKey(storageKey)) {
		return null;
	}
	return path.join(root, ...storageKey.split("/"));
}

function fileUrl(storageKey: string, query: string): string {
	const pathname = storageKey.split("/").map(encodeURIComponent).join("/");
	return `${getRequestOrigin() ?? ""}${FILES_PATH_PREFIX}${pathname}?${query}`;
}

function isMissingFile(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error.code === "ENOENT" || error.code === "ENOTDIR")
	);
}

async function statFile(filePath: string) {
	try {
		const info = await stat(filePath);
		return info.isFile() ? info : null;
	} catch (error) {
		if (isMissingFile(error)) {
			return null;
		}
		throw error;
	}
}

export interface LocalObjectStorage extends ObjectStorage {
	/** 本地目录中有没有这个对象。 */
	has: (storageKey: string) => Promise<boolean>;
}

function requirePath(root: string, storageKey: string): string {
	const filePath = localPathOf(root, storageKey);
	if (filePath === null) {
		throw new Error(`对象键不安全：${storageKey}`);
	}
	return filePath;
}

/**
 * 服务器本地目录中的对象存储。上传和下载使用 server 签发的地址（file-url-signing），
 * 与 R2 的预签名地址的用法相同，所以前端、MCP 和 SDK 不需要区分两种存储。
 */
export function createLocalStorage(
	root: string = localStorageRoot()
): LocalObjectStorage {
	const headObject = async (
		storageKey: string
	): Promise<AttachmentObjectHead | null> => {
		const filePath = localPathOf(root, storageKey);
		const info = filePath === null ? null : await statFile(filePath);
		if (info === null) {
			return null;
		}
		return {
			contentLength: info.size,
			contentType: contentTypeForKey(storageKey),
		};
	};
	return {
		caseImageUrl: (storageKey) =>
			Promise.resolve(fileUrl(storageKey, downloadQuery(storageKey, null))),
		has: async (storageKey) => (await headObject(storageKey)) !== null,
		headObject,
		presignDownload: (storageKey) =>
			Promise.resolve(
				fileUrl(
					storageKey,
					downloadQuery(storageKey, roundedExpiry(DOWNLOAD_URL_TTL_SECONDS))
				)
			),
		// biome-ignore lint/suspicious/useAwait: async 让不安全的对象键变成被拒绝的 Promise，与 R2 的签名一致
		presignUpload: async (storageKey, object) => {
			requirePath(root, storageKey);
			return fileUrl(
				storageKey,
				uploadQuery(storageKey, {
					...object,
					expiresAt: secondsFromNow(UPLOAD_URL_TTL_SECONDS),
				})
			);
		},
		remove: async (storageKey) => {
			await rm(requirePath(root, storageKey), { force: true });
		},
	};
}

export type LocalWriteResult =
	| { kind: "ok" }
	| { kind: "size-mismatch"; receivedBytes: number };

class SizeExceededError extends Error {}

function countBytes(maxBytes: number, counter: { bytes: number }): Transform {
	return new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			counter.bytes += chunk.length;
			if (counter.bytes > maxBytes) {
				callback(new SizeExceededError());
				return;
			}
			callback(null, chunk);
		},
	});
}

/**
 * 把上传的内容写入本地目录。先写到同一目录中的临时文件，大小正确时再改名，
 * 所以读取方不会读到写了一半的文件。大小与签发的大小不同时，删除临时文件。
 */
export async function writeLocalObject(input: {
	body: WebReadableStream<Uint8Array>;
	expectedBytes: number;
	root: string;
	storageKey: string;
}): Promise<LocalWriteResult> {
	const filePath = requirePath(input.root, input.storageKey);
	await mkdir(path.dirname(filePath), { recursive: true });
	const temporaryPath = `${filePath}.${randomUUID()}.uploading`;
	const counter = { bytes: 0 };
	try {
		await pipeline(
			Readable.fromWeb(input.body),
			countBytes(input.expectedBytes, counter),
			createWriteStream(temporaryPath, { flags: "wx" })
		);
	} catch (error) {
		await rm(temporaryPath, { force: true });
		if (error instanceof SizeExceededError) {
			return { kind: "size-mismatch", receivedBytes: counter.bytes };
		}
		throw error;
	}
	if (counter.bytes !== input.expectedBytes) {
		await rm(temporaryPath, { force: true });
		return { kind: "size-mismatch", receivedBytes: counter.bytes };
	}
	await rename(temporaryPath, filePath);
	return { kind: "ok" };
}
