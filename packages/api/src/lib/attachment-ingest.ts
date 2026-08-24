import type { TestRunAttachmentKind } from "@automationstack/db/schema/test-runs";

import {
	type AttachmentKeyScope,
	type AttachmentUploadValidation,
	isAttachmentKeyOwnedBy,
	validateAttachmentUpload,
} from "./attachment-policy";
import type { TestRunErrorThrowers } from "./test-run-errors";

/**
 * 直传对象的入库前校验。
 *
 * 这一段单独成文件，是因为它携带本模块唯一的**安全性质**：
 * **归属校验必须先于任何碰对象的操作**。违规对象要删，而删除的目标是调用方
 * 传进来的 key——先删后校验（或者干脆不校验）就等于对外提供了一个
 * 「把任意 key 给我，我帮你删」的原语，谁都能拿它清空别人的截图。
 *
 * 这种性质最典型的死法不是写错，而是三个月后有人为了「少一次 await」
 * 把几行重排了，而所有测试照样绿。所以它有名字、有独立的编排测试
 * （`attachment-ingest.test.ts`），改动顺序会直接让测试红。
 *
 * 它不碰数据库、不碰 oRPC context，`storage` 只收下面那个两方法的窄接口——
 * 真正的守卫（`submitted` 锁死）仍然在 repository 的写事务里，不在这。
 */

/** `HeadObject` 读回的对象属性，只取入库需要的两项。 */
export interface AttachmentObjectHead {
	contentLength: number;
	contentType: string;
}

/**
 * 本段逻辑对存储的全部要求。
 *
 * 刻意不复用 `R2Storage`：签名相关的两个方法在这里一次都用不到，
 * 收进来只会让「这段代码能干什么」变得比实际更大——测试里也就得去假造
 * 两个永远不会被调用的方法。
 */
export interface AttachmentObjectStore {
	headObject: (storageKey: string) => Promise<AttachmentObjectHead | null>;
	remove: (storageKey: string) => Promise<void>;
}

/** 校验通过后、可以直接落库的真值。 */
export interface VerifiedAttachmentObject {
	contentType: string;
	sizeBytes: number;
}

/**
 * 把校验结果翻译成给用户看的错误。
 *
 * `source` 只影响文案：presign 阶段校的是前端**声明**的值，register 阶段校的是
 * `HeadObject` 读回的**实际**值。两者说的话必须不一样——用户看到「文件超过上限」
 * 和看到「实际上传的文件超过上限」，要采取的动作是不同的（前者换个文件，
 * 后者说明他的上传工具没按声明来）。
 */
export function throwAttachmentViolation(
	violation: Exclude<AttachmentUploadValidation, { kind: "ok" }>,
	subject: {
		contentType: string;
		kind: TestRunAttachmentKind;
		sizeBytes: number;
	},
	errors: TestRunErrorThrowers,
	source: "declared" | "stored"
): never {
	const prefix = source === "stored" ? "实际上传的" : "";
	if (violation.kind === "too-large") {
		throw errors.BAD_REQUEST({
			message: `${prefix}附件 ${subject.sizeBytes} 字节，超过上限 ${violation.maxBytes} 字节`,
		});
	}
	throw errors.BAD_REQUEST({
		message: `${subject.kind} 不支持${prefix} ${subject.contentType}，允许的类型：${violation.allowedContentTypes.join(", ")}`,
	});
}

/**
 * 归属校验 → HeadObject → 白名单/上限校验 → 违规则**先删对象再抛**。
 *
 * 四个步骤的顺序都是有理由的，不是随手排的：
 * 1. **归属校验在最前**——理由见文件头，这是整段代码存在的原因；
 * 2. `HeadObject` 拿真值——预签名 URL 一发出去，实际传了多大、传的什么类型
 *    就不再受我们控制，但 bucket 里躺着的东西是客观事实。它同时顺手堵住了
 *    「presign 完根本没传就直接 register」造出的幽灵行；
 * 3. 校验用的是真值，不是前端声明的值；
 * 4. **先删后抛**：不删就等于每一次违规上传都在 bucket 里留一份我们已经明确
 *    判定为垃圾、且永远不会有数据库行指向它的数据。删除写在抛错之前而不是
 *    交给调用方 try/catch，是因为这两件事必须一起发生，拆开迟早有分支只做一半。
 */
export async function verifyUploadedObject(
	target: {
		kind: TestRunAttachmentKind;
		scope: AttachmentKeyScope;
		storage: AttachmentObjectStore;
		storageKey: string;
	},
	errors: TestRunErrorThrowers
): Promise<VerifiedAttachmentObject> {
	if (!isAttachmentKeyOwnedBy(target.storageKey, target.scope)) {
		throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例行" });
	}
	const head = await target.storage.headObject(target.storageKey);
	if (head === null) {
		throw errors.BAD_REQUEST({ message: "对象不存在，请重新上传后再登记" });
	}
	const verified: VerifiedAttachmentObject = {
		contentType: head.contentType,
		sizeBytes: head.contentLength,
	};
	const validation = validateAttachmentUpload({
		contentType: verified.contentType,
		kind: target.kind,
		sizeBytes: verified.sizeBytes,
	});
	if (validation.kind !== "ok") {
		await target.storage.remove(target.storageKey);
		throwAttachmentViolation(
			validation,
			{ ...verified, kind: target.kind },
			errors,
			"stored"
		);
	}
	return verified;
}
