import type { NewCaseAttachmentRow } from "@automationstack/db/repositories/case-attachments-repository";
import { ORPCError } from "@orpc/server";

import type { AttachmentObjectStore } from "./attachment-ingest";
import {
	type CaseAttachmentErrorThrowers,
	verifyUploadedCaseImage,
} from "./case-attachment-ingest";
import {
	type CaseAttachmentKeyScope,
	isCaseAttachmentKeyOwnedBy,
} from "./case-attachment-policy";

export interface DraftCaseAttachmentEntry {
	fileName: string;
	id: string;
	storageKey: string;
}

export interface VerifyDraftCaseAttachmentsTarget {
	createdBy: string | null;
	entries: DraftCaseAttachmentEntry[];
	scope: CaseAttachmentKeyScope;
	storage: AttachmentObjectStore;
}

export type DraftCaseAttachmentErrors = Pick<
	CaseAttachmentErrorThrowers,
	"BAD_REQUEST"
>;

function assertNoDuplicates(
	entries: DraftCaseAttachmentEntry[],
	errors: DraftCaseAttachmentErrors
): void {
	const ids = new Set(entries.map((entry) => entry.id));
	const keys = new Set(entries.map((entry) => entry.storageKey));
	if (ids.size !== entries.length || keys.size !== entries.length) {
		throw errors.BAD_REQUEST({
			message: "附件列表里存在重复的 id 或 storageKey",
		});
	}
}

function toIngestErrors(
	errors: DraftCaseAttachmentErrors
): CaseAttachmentErrorThrowers {
	return { BAD_REQUEST: errors.BAD_REQUEST, NOT_FOUND: errors.BAD_REQUEST };
}

export async function verifyDraftCaseAttachments(
	target: VerifyDraftCaseAttachmentsTarget,
	errors: DraftCaseAttachmentErrors
): Promise<NewCaseAttachmentRow[]> {
	if (target.entries.length === 0) {
		return [];
	}
	assertNoDuplicates(target.entries, errors);
	for (const entry of target.entries) {
		if (!isCaseAttachmentKeyOwnedBy(entry.storageKey, target.scope)) {
			throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例" });
		}
	}
	const ingestErrors = toIngestErrors(errors);
	return await Promise.all(
		target.entries.map(async (entry) => {
			const verified = await verifyUploadedCaseImage(
				{
					scope: target.scope,
					storage: target.storage,
					storageKey: entry.storageKey,
				},
				ingestErrors
			);
			return {
				contentType: verified.contentType,
				createdBy: target.createdBy,
				fileName: entry.fileName,
				id: entry.id,
				sizeBytes: verified.sizeBytes,
				storageKey: entry.storageKey,
			};
		})
	);
}

export interface ResolveNewCaseAttachmentsInput {
	attachments?: DraftCaseAttachmentEntry[];
	createdBy: string | null;
	id?: string;
	projectId: string;
	storage: AttachmentObjectStore | null;
}

export function resolveNewCaseAttachments(
	input: ResolveNewCaseAttachmentsInput,
	errors: DraftCaseAttachmentErrors
): Promise<NewCaseAttachmentRow[]> {
	const entries = input.attachments ?? [];
	if (entries.length === 0) {
		return Promise.resolve([]);
	}
	if (input.id === undefined) {
		throw errors.BAD_REQUEST({
			message: "带附件创建用例时必须提供预生成的 id",
		});
	}
	if (input.storage === null) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "附件存储（R2）未配置，无法粘贴图片",
		});
	}
	return verifyDraftCaseAttachments(
		{
			createdBy: input.createdBy,
			entries,
			scope: { caseId: input.id, projectId: input.projectId },
			storage: input.storage,
		},
		errors
	);
}
