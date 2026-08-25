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

/**
 * **一条**附件的登记（plan §5.6）：校验对象 → 落库，两步都可能拒。
 *
 * 与按任务分组的编排（`./attachment-register`）分开，是因为这一条是整条通道里
 * 唯一同时碰对象存储与数据库的地方，两类失败的处置各不相同（内容违规删对象、
 * 守卫拒绝留对象），值得单独一个文件把它们摆在一起看。
 *
 * 本文件 import 了 db repository，**因此不可单测**；对象校验那一半的顺序性质
 * 在 `./attachment-verify`，那边是纯的、有单测。
 */

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

/**
 * 落库仍然走手工路径那个 `registerAttachment`，一个字都不改：`submitted` 守卫、
 * `isStorageKeyOwned` 的**事务内**判定都在它身上。唯一的区别是
 * `uploadedVia: "automation"`——这一列存在的全部理由（§3.4 / §5.6）。
 */
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
		// 走到这里说明测试任务在 HeadObject 之后被别人提交了。对象留在 bucket 里
		// 成为孤儿——不在这里删，与手工路径同一个理由：「守卫拒绝」和「内容违规」
		// 性质不同，前者的对象内容合法，只是来晚了。
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
