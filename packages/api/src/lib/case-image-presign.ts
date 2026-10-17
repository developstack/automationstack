import { prepareCaseAttachmentUpload } from "@automationstack/db/repositories/case-attachments-repository";
import { ORPCError } from "@orpc/server";

import {
	type CaseAttachmentErrorThrowers,
	throwCaseImageViolation,
} from "./case-attachment-ingest";
import {
	buildCaseAttachmentStorageKey,
	type CaseAttachmentKeyScope,
	validateCaseImageUpload,
} from "./case-attachment-policy";
import { getR2Storage, type R2Storage } from "./r2";

export const caseAttachmentErrors = {
	BAD_REQUEST: {},
	NOT_FOUND: {},
} as const;

export function requireCaseImageStorage(): R2Storage {
	const storage = getR2Storage();
	if (storage === null) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "附件存储（R2）未配置，无法上传图片",
		});
	}
	return storage;
}

export interface CaseImagePresignInput {
	caseId: string;
	contentType: string;
	sizeBytes: number;
}

export interface PresignedCaseImage {
	scope: CaseAttachmentKeyScope;
	storageKey: string;
	uploadUrl: string;
}

/**
 * 为一个已有用例的一张图片签发上传地址：先检查声明的类型和大小，再在这个用例的目录下
 * 生成对象键。上传地址只接受声明的类型和大小。界面贴图和 MCP 写入截图使用同一个方法。
 */
export async function presignCaseImageUpload(
	input: CaseImagePresignInput,
	errors: CaseAttachmentErrorThrowers
): Promise<PresignedCaseImage> {
	const storage = requireCaseImageStorage();
	const declared = validateCaseImageUpload(input);
	if (declared.kind !== "ok") {
		throwCaseImageViolation(declared, input, errors, "declared");
	}
	const prepared = await prepareCaseAttachmentUpload(input.caseId);
	if (prepared.kind !== "ok") {
		throw errors.NOT_FOUND({ message: "用例不存在" });
	}
	const storageKey = buildCaseAttachmentStorageKey(prepared.scope, {
		contentType: input.contentType,
	});
	const uploadUrl = await storage.presignUpload(storageKey, {
		contentLength: input.sizeBytes,
		contentType: input.contentType,
	});
	return { scope: prepared.scope, storageKey, uploadUrl };
}
