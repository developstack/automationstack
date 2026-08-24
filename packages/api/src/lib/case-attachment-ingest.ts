import type {
	AttachmentObjectHead,
	AttachmentObjectStore,
} from "./attachment-ingest";
import {
	type CaseAttachmentKeyScope,
	type CaseImageUploadValidation,
	isCaseAttachmentKeyOwnedBy,
	validateCaseImageUpload,
} from "./case-attachment-policy";

/**
 * 用例贴图直传后的入库前校验。
 *
 * 这一段单独成文件，是因为它携带本条链路唯一的**安全性质**：
 * **归属校验必须先于任何碰对象的操作**。违规对象要删，而删除的目标是调用方
 * 传进来的 key——先删后校验（或者干脆不校验）就等于对外提供了一个
 * 「把任意 key 给我，我帮你删」的原语，谁都能拿它清空别人用例里的图。
 *
 * 这种性质最典型的死法不是写错，而是三个月后有人为了「少一次 await」
 * 把几行重排了，而所有测试照样绿。所以它有名字、有独立的编排测试
 * （`case-attachment-ingest.test.ts`），改动顺序会直接让测试红。
 *
 * 与 `./attachment-ingest.ts` 是两份**同形状但不同判据**的代码：那边按
 * `TestRunAttachmentKind` 分档校验、还要处理测试任务的锁死拒绝。合并的代价见
 * `./case-attachment-policy.ts` 的文件头。**共用的只有类型**——
 * `AttachmentObjectHead` / `AttachmentObjectStore` 描述的是「对象存储能干什么」，
 * 与哪种附件无关，各写一遍只会让两处定义有机会漂移。
 */

/** 校验通过后、可以直接落库的真值。 */
export interface VerifiedCaseImage {
	contentType: string;
	sizeBytes: number;
}

/**
 * 本条链路需要的错误构造器。
 *
 * 只有两个：没有 `CONFLICT`——那是测试任务「已提交锁死」专用的，用例贴图没有
 * 任何等价状态（见 `case-attachments-repository.ts` 的文件头）。
 * 不复用 `./test-run-errors.ts` 的 `TestRunErrorThrowers`，是为了不让一个
 * 用不到的 `CONFLICT` 出现在签名里，暗示这里存在某种锁。
 */
export interface CaseAttachmentErrorThrowers {
	BAD_REQUEST: (options?: { message?: string }) => Error;
	NOT_FOUND: (options?: { message?: string }) => Error;
}

/**
 * 把校验结果翻译成给用户看的错误。
 *
 * `source` 只影响文案：presign 阶段校的是前端**声明**的值，register 阶段校的是
 * `HeadObject` 读回的**实际**值。两者说的话必须不一样——用户看到「图片超过上限」
 * 和看到「实际上传的图片超过上限」，要采取的动作是不同的（前者换张图，
 * 后者说明他的上传过程没按声明来）。
 */
export function throwCaseImageViolation(
	violation: Exclude<CaseImageUploadValidation, { kind: "ok" }>,
	subject: VerifiedCaseImage,
	errors: CaseAttachmentErrorThrowers,
	source: "declared" | "stored"
): never {
	const prefix = source === "stored" ? "实际上传的" : "";
	if (violation.kind === "too-large") {
		throw errors.BAD_REQUEST({
			message: `${prefix}图片 ${subject.sizeBytes} 字节，超过上限 ${violation.maxBytes} 字节`,
		});
	}
	throw errors.BAD_REQUEST({
		message: `用例贴图不支持${prefix} ${subject.contentType}，允许的类型：${violation.allowedContentTypes.join(", ")}`,
	});
}

/**
 * 归属校验 → HeadObject → 白名单/上限校验 → 违规则**先删对象再抛**。
 *
 * 四个步骤的顺序都是有理由的，不是随手排的：
 * 1. **归属校验在最前**——理由见文件头，这是整段代码存在的原因；
 * 2. `HeadObject` 拿真值——预签名 URL 一发出去，实际传了多大、传的什么类型
 *    就不再受我们控制，但 bucket 里躺着的东西是客观事实。它同时顺手堵住了
 *    「presign 完根本没传就直接 register」造出的幽灵行——那种行会让正文里
 *    出现一张永远加载不出来的图；
 * 3. 校验用的是真值，不是前端声明的值；
 * 4. **先删后抛**：不删就等于每一次违规上传都在 bucket 里留一份我们已经明确
 *    判定为垃圾、且永远不会有数据库行指向它的数据。删除写在抛错之前而不是
 *    交给调用方 try/catch，是因为这两件事必须一起发生，拆开迟早有分支只做一半。
 *
 * ⚠️ 这里删对象是安全的，且与「正文编辑不删对象」那条规矩不矛盾：此刻被删的
 * 对象**还没有任何数据库行、更没有任何版本快照引用它**——它连 id 都还没有。
 */
export async function verifyUploadedCaseImage(
	target: {
		scope: CaseAttachmentKeyScope;
		storage: AttachmentObjectStore;
		storageKey: string;
	},
	errors: CaseAttachmentErrorThrowers
): Promise<VerifiedCaseImage> {
	if (!isCaseAttachmentKeyOwnedBy(target.storageKey, target.scope)) {
		throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例" });
	}
	const head: AttachmentObjectHead | null = await target.storage.headObject(
		target.storageKey
	);
	if (head === null) {
		throw errors.BAD_REQUEST({ message: "对象不存在，请重新上传后再登记" });
	}
	const verified: VerifiedCaseImage = {
		contentType: head.contentType,
		sizeBytes: head.contentLength,
	};
	const validation = validateCaseImageUpload(verified);
	if (validation.kind !== "ok") {
		await target.storage.remove(target.storageKey);
		throwCaseImageViolation(validation, verified, errors, "stored");
	}
	return verified;
}
