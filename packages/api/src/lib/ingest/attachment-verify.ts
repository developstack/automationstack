import type { TestRunAttachmentKind } from "@automationstack/db/schema/test-runs";

import type { AttachmentObjectStore } from "../attachment-ingest";
import {
	type AttachmentKeyScope,
	isAttachmentKeyOwnedBy,
	validateAttachmentUpload,
} from "../attachment-policy";

/**
 * 登记阶段的**对象校验**（plan §5.6）：bucket 里那个对象到底是不是我们发出去的
 * 那把钥匙该写的位置、到底传上来了什么。
 *
 * 单独成一个模块是因为它是这条通道里唯一会**碰外部对象存储**的纯逻辑：它有
 * 副作用（违规对象要删），却仍然不碰数据库，于是能用一个假的
 * `AttachmentObjectStore` 单测——顺序性质有单测钉着，见下。
 * 那两条 db import 依旧只是 `import type`，编译期擦除。
 */

export interface VerifyAutomationAttachmentInput {
	kind: TestRunAttachmentKind;
	scope: AttachmentKeyScope;
	storageKey: string;
	store: AttachmentObjectStore;
}

export type VerifyAutomationAttachmentResult =
	| { contentType: string; kind: "ok"; sizeBytes: number }
	| { kind: "rejected"; reason: string };

/**
 * 登记阶段的对象校验：**归属校验 → HeadObject → 白名单/上限 → 违规先删后拒**。
 *
 * 与 `../attachment-ingest.ts` 的 `verifyUploadedObject` 是同一段逻辑、同一个
 * 顺序性质，唯一的区别是这里返回类型化结果而不是抛 `ORPCError`：ingest 是裸
 * HTTP 端点，一条不合规的附件只该在对账单里占一行，不该把整批打成 4xx——
 * 那正是「附件传不上去不能拖垮整次上报」（§5.6 / D9）。
 *
 * ⚠️ **归属校验必须先于任何碰对象的操作**。违规对象要删，而删除的目标是
 * 调用方传进来的 key——先删后校验（或者干脆不校验）就等于对外提供了一个
 * 「把任意 key 给我，我帮你删」的原语，谁都能拿它清空别人的截图。
 * 这几行的顺序有单测钉着，改动顺序会直接让测试红。
 */
export async function verifyAutomationAttachment(
	input: VerifyAutomationAttachmentInput
): Promise<VerifyAutomationAttachmentResult> {
	if (!isAttachmentKeyOwnedBy(input.storageKey, input.scope)) {
		return { kind: "rejected", reason: "storageKey 不属于该用例行" };
	}
	const head = await input.store.headObject(input.storageKey);
	// 「presign 完根本没传就直接 register」造出的幽灵行会在报告页上变成一张
	// 永远加载不出来的图，所以对象不存在就是拒绝，不是「稍后补上」。
	if (head === null) {
		return { kind: "rejected", reason: "对象不存在，请重新上传后再登记" };
	}
	const validation = validateAttachmentUpload({
		contentType: head.contentType,
		kind: input.kind,
		sizeBytes: head.contentLength,
	});
	if (validation.kind === "ok") {
		return {
			contentType: head.contentType,
			kind: "ok",
			sizeBytes: head.contentLength,
		};
	}
	// 先删后拒：不删就等于每一次违规上传都在 bucket 里留一份我们已经明确
	// 判定为垃圾、且永远不会有数据库行指向它的数据。
	await input.store.remove(input.storageKey);
	if (validation.kind === "too-large") {
		return {
			kind: "rejected",
			reason: `实际上传的附件 ${head.contentLength} 字节，超过单文件上限 ${validation.maxBytes} 字节`,
		};
	}
	return {
		kind: "rejected",
		reason: `${input.kind} 不支持实际上传的 ${head.contentType}，允许的类型：${validation.allowedContentTypes.join(", ")}`,
	};
}
