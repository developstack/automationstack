import {
	listAttachments,
	prepareAttachmentUpload,
	registerAttachment,
	removeAttachment,
} from "@automationstack/db/repositories/test-run-attachments-repository";
import type { TestRunAttachment } from "@automationstack/db/schema/test-run-attachments";
import { isR2Configured } from "@automationstack/env/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import {
	throwAttachmentViolation,
	verifyUploadedObject,
} from "../lib/attachment-ingest";
import {
	buildAttachmentStorageKey,
	isAttachmentKeyOwnedBy,
	validateAttachmentUpload,
} from "../lib/attachment-policy";
import {
	requireRunAttachmentMember,
	requireRunCaseMember,
} from "../lib/project-scope";
import { getR2Storage, type R2Storage } from "../lib/r2";
import { publishInvalidate } from "../lib/realtime-publish";
import {
	type RunWriteRejection,
	rejectRunWrite,
	type TestRunErrorThrowers,
	testRunErrors,
} from "../lib/test-run-errors";

/**
 * 测试任务附件（plan §6）。
 *
 * 上传是两阶段的：`presignUpload` → 前端把文件**直接** PUT 到 R2 →
 * `register` 登记元数据。文件字节不经过我们的进程，理由与它的代价
 * （会产生孤儿对象、以及将来怎么清理）都写在 `../lib/r2.ts` 的文件头。
 *
 * 三条写路径（presign / register / remove）的 `submitted` 守卫都在 repository 的
 * **写操作所在事务**里跑（plan §2.5），不靠 router 这层的判断——那是 TOCTOU。
 *
 * `register` 在事务之前额外查了一次（`prepareAttachmentUpload`），那**不是**守卫，
 * 而是为了拿到 projectId / runId 去验 key 归属；真正算数的守卫仍然是
 * `registerAttachment` 事务内的那次。归属校验为什么必须先于任何碰对象的操作，
 * 以及违规对象为什么先删后抛，写在 `../lib/attachment-ingest.ts` 的文件头。
 */

const attachmentKindSchema = z.enum(["screenshot", "video", "log", "other"]);

/**
 * 体积在 zod 这一层只保证「是个正整数」，上限交给
 * `validateAttachmentUpload`：那样超限时用户拿到的是一句带具体上限的中文提示，
 * 而不是一条 zod 的字段校验错误。
 */
const sizeBytesSchema = z.number().int().positive();

const presignUploadSchema = z.object({
	contentType: z.string().min(1),
	kind: attachmentKindSchema,
	runCaseId: z.uuid(),
	sizeBytes: sizeBytesSchema,
});

/**
 * **`register` 不收 contentType / sizeBytes**。
 *
 * 那两个值只在 `presignUpload` 阶段收，作用是**预检**——在用户选完文件、
 * 还没开始传的时候就告诉他「太大了」「这种类型不行」，比传完 20MB 再报错体验好得多。
 * 但预签名 URL 一发出去，实际传了多大、传的什么类型就不再受我们控制，
 * 所以它们不能当落库的数据源。落库用的是 `HeadObject` 从 bucket 里读回的客观事实。
 * 参数留着只会让人以为「前端报多大就是多大」，干脆不收。
 */
const registerSchema = z.object({
	/**
	 * 展示用的原始文件名。**只登记时收，presign 时不收**——object key 规则刻意
	 * 不含文件名，收了只会诱导后来者拿它去拼 key。长度设上界是因为这是客户端
	 * 可控字符串，不封顶等于让人往列表页塞任意长的内容。
	 */
	fileName: z.string().min(1).max(255),
	kind: attachmentKindSchema,
	runCaseId: z.uuid(),
	storageKey: z.string().min(1),
});

const runCaseSchema = z.object({ runCaseId: z.uuid() });

const attachmentIdSchema = z.object({ attachmentId: z.uuid() });

/** 附件列表项：数据库那行 + 现签的 GET URL。 */
export interface TestRunAttachmentView {
	attachment: TestRunAttachment;
	/**
	 * 15 分钟有效的签名 GET URL。
	 * R2 未配置时为 null——读报告永远不该因为存储配置缺失而整个失败，
	 * 前端据此把缩略图换成「附件不可访问」占位即可。
	 */
	url: string | null;
}

/** 未配置 R2 时所有写路径的统一出口，避免 SDK 在没有凭证时抛出 500。 */
function requireStorage(): R2Storage {
	const storage = getR2Storage();
	if (storage === null) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "附件存储（R2）未配置，无法上传或删除附件",
		});
	}
	return storage;
}

/**
 * `locked` 复用 `rejectRunWrite`（与 test-runs / test-run-execution 同一句文案，
 * plan §2.5 的锁死提示不该在三个 router 里长出三种说法）；`not-found` 自己抛，
 * 因为这里找不到的是用例行或附件，套用那边的「测试任务不存在」会把人指错方向。
 */
function rejectAttachmentWrite(
	rejection: RunWriteRejection,
	errors: TestRunErrorThrowers,
	notFoundMessage: string
): never {
	if (rejection.kind === "locked") {
		rejectRunWrite(rejection, errors);
	}
	throw errors.NOT_FOUND({ message: notFoundMessage });
}

export const testRunAttachmentsRouter = {
	/** 附件列表 + 现签的 GET URL，最近上传的在前。已提交的测试任务同样可读。 */
	list: protectedProcedure
		.input(runCaseSchema)
		.use(requireRunCaseMember)
		.handler(async ({ input }): Promise<TestRunAttachmentView[]> => {
			const attachments = await listAttachments(input.runCaseId);
			const storage = getR2Storage();
			if (storage === null) {
				return attachments.map((attachment) => ({ attachment, url: null }));
			}
			return await Promise.all(
				attachments.map(async (attachment) => ({
					attachment,
					url: await storage.presignDownload(attachment.storageKey),
				}))
			);
		}),

	/**
	 * 签一个 5 分钟的 PUT URL，前端拿去直传。
	 *
	 * 校验必须全部发生在**签名之前**：URL 一旦发出去就是一张收不回的写入凭证，
	 * 到 `register` 再判大小和类型，对象早就躺在 bucket 里了。
	 */
	presignUpload: protectedProcedure
		.errors(testRunErrors)
		.input(presignUploadSchema)
		.use(requireRunCaseMember)
		.handler(async ({ errors, input }) => {
			const storage = requireStorage();
			const declared = validateAttachmentUpload(input);
			if (declared.kind !== "ok") {
				throwAttachmentViolation(declared, input, errors, "declared");
			}
			const prepared = await prepareAttachmentUpload(input.runCaseId);
			if (prepared.kind !== "ok") {
				rejectAttachmentWrite(prepared, errors, "用例行不存在");
			}
			const storageKey = buildAttachmentStorageKey(prepared.scope, input);
			const uploadUrl = await storage.presignUpload(
				storageKey,
				input.contentType
			);
			return { storageKey, uploadUrl };
		}),

	/**
	 * 前端直传成功后登记元数据。
	 *
	 * **落库前先 `HeadObject` 读回对象的真实 size 与 contentType，并以它为准。**
	 * 这是「预签名 URL 一旦发出就管不住」那个洞的补法：签名约束不了实际传了什么，
	 * 但 bucket 里躺着的东西是客观事实，读一遍就知道。它同时顺手堵住了
	 * 「presign 完根本没传就直接 register」造出的幽灵行——那种行会在报告页上
	 * 变成一张永远加载不出来的图。
	 *
	 * 代价是每次登记多一次 R2 往返。这发生在用户点了「上传」并等文件传完之后，
	 * 几十毫秒无人察觉。
	 *
	 * 校验不通过时**删掉对象**再拒绝：不删就等于每一次超限上传都在 bucket 里
	 * 留一份我们明确判定为垃圾、且永远不会有数据库行指向它的数据。
	 */
	register: protectedProcedure
		.errors(testRunErrors)
		.input(registerSchema)
		.use(requireRunCaseMember)
		.handler(async ({ context, errors, input }) => {
			const storage = requireStorage();
			// 这次查询**不是**守卫，只为拿到 projectId / runId 去验 key 归属
			// （真正的守卫在 registerAttachment 的事务里）。归属校验与对象校验
			// 的顺序由 verifyUploadedObject 保证，理由见那个文件的头注释。
			const prepared = await prepareAttachmentUpload(input.runCaseId);
			if (prepared.kind !== "ok") {
				rejectAttachmentWrite(prepared, errors, "用例行不存在");
			}
			const verified = await verifyUploadedObject(
				{
					kind: input.kind,
					scope: prepared.scope,
					storage,
					storageKey: input.storageKey,
				},
				errors
			);
			const result = await registerAttachment({
				contentType: verified.contentType,
				createdBy: context.user.id,
				fileName: input.fileName,
				isStorageKeyOwned: (scope) =>
					isAttachmentKeyOwnedBy(input.storageKey, scope),
				kind: input.kind,
				runCaseId: input.runCaseId,
				sizeBytes: verified.sizeBytes,
				storageKey: input.storageKey,
			});
			if (result.kind === "invalid-storage-key") {
				throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例行" });
			}
			if (result.kind !== "registered") {
				// 走到这里说明测试任务在 HeadObject 之后被别人提交了。对象留在 bucket 里
				// 成为孤儿——不在这里删，是因为「守卫拒绝」和「内容违规」性质不同：
				// 前者的对象内容合法，只是来晚了，交给按前缀的批量清理处理更稳妥。
				rejectAttachmentWrite(result, errors, "用例行不存在");
			}
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.scope.runId],
				projectId: result.scope.projectId,
			});
			return result.attachment;
		}),

	/**
	 * 删附件：先删库、后删 R2 对象（顺序的理由见 repository 注释）。
	 *
	 * 未配置 R2 时直接拒绝而不是「只删库」：附件行能存在就说明 R2 曾经配好过，
	 * 此刻拿不到句柄意味着配置被改坏了。这时候删库会留下一个**没人知道 key**
	 * 的孤儿对象——比拒绝这次删除糟得多。
	 */
	remove: protectedProcedure
		.errors(testRunErrors)
		.input(attachmentIdSchema)
		.use(requireRunAttachmentMember)
		.handler(async ({ context, errors, input }) => {
			const storage = requireStorage();
			const result = await removeAttachment(input.attachmentId);
			if (result.kind !== "removed") {
				rejectAttachmentWrite(result, errors, "附件不存在");
			}
			await storage.remove(result.attachment.storageKey);
			publishInvalidate({
				action: "update",
				context,
				entity: "testRun",
				ids: [result.scope.runId],
				projectId: result.scope.projectId,
			});
			return { id: result.attachment.id };
		}),

	/**
	 * 附件存储是否可用。**只有一个布尔，别往里加第二个字段。**
	 *
	 * 存在的理由：`isR2Configured()` 只在服务端，前端此前只能等用户真的传一次、
	 * 撞上 `presignUpload` 抛的 `PRECONDITION_FAILED` 才知道存储没配，
	 * 于是「入口禁用并说明原因」实际只能做到「第一次失败之后」。有了这个查询，
	 * 上传按钮从第一次渲染起就能是禁用 + 带解释的。
	 *
	 * ⚠️ 返回体里**绝不能**出现 bucket 名、endpoint、account id、密钥或其任何
	 * 片段乃至长度。「存储不可用」是给普通成员看的界面状态，不是运维诊断接口；
	 * 想知道到底缺哪个变量，去看服务端启动日志。同理这里**不发任何真实的 R2
	 * 网络请求**——只读环境变量齐不齐，一次探活既慢又会把「配置错了」和
	 * 「R2 此刻抽风」混成同一个答案。
	 */
	storageStatus: protectedProcedure.handler((): { configured: boolean } => ({
		configured: isR2Configured(),
	})),
};
