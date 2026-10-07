import {
	type AttachmentScope,
	registerAttachment,
} from "@automationstack/db/repositories/test-run-attachments-repository";

import { isAttachmentKeyOwnedBy } from "../attachment-policy";
import type { R2Storage } from "../r2";
import type {
	IngestAttachmentRegistered,
	IngestAttachmentRegisterRejection,
} from "./attachment-contract";
import {
	type AttachmentRegisterItem,
	describeRunUnwritable,
	verifyAutomationAttachment,
} from "./attachment-reconcile";

export interface RegisterOne {
	item: AttachmentRegisterItem;
	scope: AttachmentScope;
	storage: R2Storage;
	userId: string;
}

export type RegisterOneResult =
	| {
			attachment: IngestAttachmentRegistered;
			kind: "registered";
			runId: string;
	  }
	| { kind: "rejected"; rejection: IngestAttachmentRegisterRejection };

function rejectOne(
	item: AttachmentRegisterItem,
	reason: string
): RegisterOneResult {
	return {
		kind: "rejected",
		rejection: {
			index: item.index,
			reason,
			runCaseId: item.runCaseId,
			storageKey: item.storageKey,
		},
	};
}

export async function registerOne(
	input: RegisterOne
): Promise<RegisterOneResult> {
	const { item } = input;
	const verified = await verifyAutomationAttachment({
		kind: item.kind,
		scope: input.scope,
		storageKey: item.storageKey,
		store: input.storage,
	});
	if (verified.kind !== "ok") {
		return rejectOne(item, verified.reason);
	}
	const result = await registerAttachment({
		contentType: verified.contentType,
		createdBy: input.userId,
		fileName: item.fileName,
		isStorageKeyOwned: (scope) =>
			isAttachmentKeyOwnedBy(item.storageKey, scope),
		kind: item.kind,
		runCaseId: item.runCaseId,
		sizeBytes: verified.sizeBytes,
		storageKey: item.storageKey,
		uploadedVia: "automation",
	});
	if (result.kind === "invalid-storage-key") {
		return rejectOne(item, "storageKey 不属于该用例行");
	}
	if (result.kind !== "registered") {
		return rejectOne(item, describeRunUnwritable(result, null));
	}
	return {
		attachment: {
			attachmentId: result.attachment.id,
			index: item.index,
			runCaseId: item.runCaseId,
			storageKey: item.storageKey,
		},
		kind: "registered",
		runId: result.scope.runId,
	};
}
