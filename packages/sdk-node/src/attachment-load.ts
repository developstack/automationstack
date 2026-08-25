import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import type { AttachmentKind } from "./contract-types";
import type { AttachmentInput, LoadedAttachment } from "./reporter-types";

/**
 * 把用户给的附件描述读成字节。**唯一碰文件系统的地方**——上传那一层只认
 * `LoadedAttachment`，这样它可以被完全不落盘地测试。
 */

const KIND_FALLBACK_CONTENT_TYPE: Record<AttachmentKind, string> = {
	log: "text/plain",
	other: "application/octet-stream",
	screenshot: "image/png",
	video: "video/mp4",
};

/**
 * 只列真的会从测试框架里出来的那几种。猜不出来时**不猜**，
 * 回落到按 `kind` 给的默认值——猜错的 contentType 会让附件在报告页上
 * 以「下载」而不是「预览」的方式出现，比 `application/octet-stream` 更迷惑人。
 */
const EXTENSION_CONTENT_TYPE: Record<string, string> = {
	".gif": "image/gif",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".json": "application/json",
	".log": "text/plain",
	".mp4": "video/mp4",
	".png": "image/png",
	".txt": "text/plain",
	".webm": "video/webm",
	".zip": "application/zip",
};

export class AttachmentInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AttachmentInputError";
	}
}

function resolveContentType(input: AttachmentInput): string {
	if (input.contentType) {
		return input.contentType;
	}
	const source = input.filePath ?? input.fileName;
	const byExtension = source
		? EXTENSION_CONTENT_TYPE[extname(source).toLowerCase()]
		: undefined;
	return byExtension ?? KIND_FALLBACK_CONTENT_TYPE[input.kind];
}

function resolveFileName(input: AttachmentInput): string {
	if (input.fileName) {
		return input.fileName;
	}
	return input.filePath ? basename(input.filePath) : input.kind;
}

/**
 * `body` 优先于 `filePath`：截图和 trace 常常本来就在内存里，
 * 先落盘再读回来只是白做一次 IO。两个都没给是**编程错误**，
 * 在入队这一刻就抛——拖到 presign 之后才发现的话，一次上报已经跑了半程。
 */
export async function loadAttachment(
	input: AttachmentInput
): Promise<LoadedAttachment> {
	const body = input.body ?? (await readBodyFromDisk(input));
	return {
		body,
		contentType: resolveContentType(input),
		fileName: resolveFileName(input),
		kind: input.kind,
		sizeBytes: body.byteLength,
		sourceRef: input.sourceRef,
	};
}

async function readBodyFromDisk(input: AttachmentInput): Promise<Uint8Array> {
	if (!input.filePath) {
		throw new AttachmentInputError(
			`附件 ${input.sourceRef}/${input.kind} 既没有 body 也没有 filePath`
		);
	}
	return await readFile(input.filePath);
}

/**
 * 入队时的同步校验。**只查「本地编程错误」这一种**：既没有 `body` 也没有
 * `filePath`，这在 presign 之后才发现就等于白跑半程。真正的读盘留到
 * `finish()`——附件在磁盘上待到最后一刻，一轮几百张截图不必整轮驻留内存。
 */
export function assertAttachmentInput(input: AttachmentInput): void {
	if (!(input.body || input.filePath)) {
		throw new AttachmentInputError(
			`附件 ${input.sourceRef}/${input.kind} 既没有 body 也没有 filePath`
		);
	}
}

export interface LoadedAttachments {
	/** 读盘失败的那些，逐条留一句话——静默丢附件与静默丢结论一样糟。 */
	failures: string[];
	loaded: LoadedAttachment[];
}

/** 一个读不出来的文件不该让其余几百个附件跟着丢，所以逐个兜。 */
export async function loadAttachments(
	inputs: AttachmentInput[]
): Promise<LoadedAttachments> {
	const result: LoadedAttachments = { failures: [], loaded: [] };
	for (const input of inputs) {
		try {
			// biome-ignore lint/performance/noAwaitInLoops: 逐个兜异常，Promise.all 会让一个读不出来的文件带走整批
			result.loaded.push(await loadAttachment(input));
		} catch (error) {
			result.failures.push(
				`${input.sourceRef}/${input.kind}：（本地）读取失败 ${String(error)}`
			);
		}
	}
	return result;
}
