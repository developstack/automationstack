import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import type { AttachmentKind } from "./contract-types.js";
import type { AttachmentInput, LoadedAttachment } from "./reporter-types.js";

const KIND_FALLBACK_CONTENT_TYPE: Record<AttachmentKind, string> = {
	log: "text/plain",
	other: "application/octet-stream",
	screenshot: "image/png",
	video: "video/mp4",
};

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

export function assertAttachmentInput(input: AttachmentInput): void {
	if (!(input.body || input.filePath)) {
		throw new AttachmentInputError(
			`附件 ${input.sourceRef}/${input.kind} 既没有 body 也没有 filePath`
		);
	}
}

export interface LoadedAttachments {
	failures: string[];
	loaded: LoadedAttachment[];
}

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
