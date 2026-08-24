import {
	listCaseAttachments,
	prepareCaseAttachmentUpload,
	registerCaseAttachment,
} from "@automationstack/db/repositories/case-attachments-repository";
import type { CaseAttachment } from "@automationstack/db/schema/case-attachments";
import { isR2Configured } from "@automationstack/env/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import {
	throwCaseImageViolation,
	verifyUploadedCaseImage,
} from "../lib/case-attachment-ingest";
import {
	buildCaseAttachmentStorageKey,
	isCaseAttachmentKeyOwnedBy,
	validateCaseImageUpload,
} from "../lib/case-attachment-policy";
import { getR2Storage, type R2Storage } from "../lib/r2";
import { caseAttachmentDraftProcedures } from "./case-attachment-drafts";

/**
 * 用例正文里的贴图（前置条件 / 每个步骤格都能粘）。
 *
 * 形状与 `test-run-attachments.ts` 完全一致，是**有意照抄**的：
 * `presignUpload` → 前端把图**直接** PUT 到 R2 → `register` 登记元数据。
 * 文件字节不经过我们的进程，理由与代价（会产生孤儿对象）写在 `../lib/r2.ts` 的文件头。
 *
 * 正文里存的是 `![](attachment:<id>)`，格式的唯一定义在
 * `../lib/case-attachment-ref.ts`（前端产生、前端解析，服务端一行都不解析正文）。
 * 底层因此仍然是纯文本：`CaseStep.step` / `expected` 还是 string，
 * `preconditions` 还是 text，AI 生成 / Jira ADF 导出 / 导入导出 / 版本 diff 全不受影响。
 *
 * **没有 remove**：删附件会让引用它的历史版本快照碎图，理由完整写在
 * `packages/db/src/schema/case-attachments.ts` 的文件头。这不是漏做。
 */

/**
 * 只有两个错误码：没有 `CONFLICT`——用例贴图没有「已提交锁死」那种状态
 * （见 repository 文件头）。
 */
const caseAttachmentErrors = {
	BAD_REQUEST: {},
	NOT_FOUND: {},
} as const;

/**
 * 体积在 zod 这一层只保证「是个正整数」，上限交给 `validateCaseImageUpload`：
 * 那样超限时用户拿到的是一句带具体上限的中文提示，而不是一条 zod 的字段校验错误。
 */
const sizeBytesSchema = z.number().int().positive();

/**
 * 展示用的原始文件名。长度设上界是因为这是客户端可控字符串，
 * 不封顶等于让人往正文/附件列表里塞任意长的内容。
 *
 * ⚠️ 粘贴场景里剪贴板图片**通常没有文件名**，前端会合成一个（如 `pasted-image.png`）。
 * 它只是展示标签，**绝不参与 key 生成**——key 里没有任何用户可控段，
 * 见 `buildCaseAttachmentStorageKey`。
 */
const fileNameSchema = z.string().min(1).max(255);

const presignUploadSchema = z.object({
	caseId: z.uuid(),
	contentType: z.string().min(1),
	/**
	 * presign 阶段也收 fileName，只为在**开始传之前**就把非法长度挡掉；
	 * 落库用的是 `register` 那次的值。
	 * （`test-run-attachments.ts` 的 presign 刻意不收，因为那边的文件名来自用户
	 * 选文件，早校验意义不大；这里两阶段之间隔着一次完整上传，早说一句更友好。）
	 */
	fileName: fileNameSchema,
	sizeBytes: sizeBytesSchema,
});

/**
 * **`register` 不收 contentType / sizeBytes**。
 *
 * 那两个值只在 `presignUpload` 阶段收，作用是**预检**——在图还没开始传的时候
 * 就告诉用户「太大了」「这种类型不行」。但预签名 URL 一发出去，实际传了多大、
 * 传的什么类型就不再受我们控制，所以它们不能当落库的数据源。
 * 落库用的是 `HeadObject` 从 bucket 里读回的客观事实。
 */
const registerSchema = z.object({
	caseId: z.uuid(),
	fileName: fileNameSchema,
	storageKey: z.string().min(1),
});

const caseSchema = z.object({ caseId: z.uuid() });

/** 附件列表项：数据库那行 + 现签的 GET URL。 */
export interface CaseAttachmentView {
	attachment: CaseAttachment;
	/**
	 * 15 分钟有效的签名 GET URL。
	 * R2 未配置时为 null——读用例永远不该因为存储配置缺失而整个失败，
	 * 前端据此把图换成「图片不可访问」占位即可。
	 */
	url: string | null;
}

/** 未配置 R2 时所有写路径的统一出口，避免 SDK 在没有凭证时抛出 500。 */
function requireStorage(): R2Storage {
	const storage = getR2Storage();
	if (storage === null) {
		throw new ORPCError("PRECONDITION_FAILED", {
			message: "附件存储（R2）未配置，无法粘贴图片",
		});
	}
	return storage;
}

export const caseAttachmentsRouter = {
	/**
	 * 「新建用例时贴图」那条草稿态链路（`presignDraftUpload` /
	 * `presignDraftDownload`）。挂在同一个命名空间下而不是另开一个顶层 router：
	 * 对前端来说它们和下面四条是同一件事的两种时机，分开只会让调用点去记
	 * 「用例存不存在」对应哪个 router。为什么必须是两套而不是合并成一套，
	 * 见 `./case-attachment-drafts.ts` 的文件头。
	 */
	...caseAttachmentDraftProcedures,

	/**
	 * 这条用例的全部贴图 + **各自现签的 GET URL，一次请求签完**。
	 *
	 * ⚠️ 前端渲染正文时必须按 id 在这份结果里查 URL，**绝不能每张图发一个请求**：
	 * 一条用例十张图就是十次往返，而且每次都要重新过一遍鉴权与数据库。
	 *
	 * 「一次请求签完全部」之所以廉价：`presignDownload` 是**纯本地的 SigV4 计算**
	 * （HMAC + 字符串拼接），不发任何网络请求，也不问 R2 对象在不在。
	 * 所以下面的 `Promise.all` 不是 N 个并发 IO，只是 N 次几十微秒的哈希，
	 * 十张图和一张图的耗时差别在噪声里。用 `Promise.all` 而不是 for 循环，
	 * 只是因为签名函数返回 Promise（SDK 的签名 API 是 async 的）。
	 *
	 * ⚠️ 给前端的缓存契约：这份结果的有效期只有 15 分钟（签名 TTL），
	 * 且**必须与用例本身一起失效**——别人保存了带新图的正文时，实时事件发的是
	 * `entity: "case"`，前端要让这条查询跟着 refetch，否则新贴的图在别人那边
	 * 会是一张查不到 URL 的破图。
	 */
	list: protectedProcedure
		.input(caseSchema)
		.handler(async ({ input }): Promise<CaseAttachmentView[]> => {
			const attachments = await listCaseAttachments(input.caseId);
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
	 *
	 * `projectId` 由服务端从 case 反查（`prepareCaseAttachmentUpload`），
	 * **不由前端传**：前端传什么就用什么，等于让任何人把图写进任意项目的前缀下。
	 */
	presignUpload: protectedProcedure
		.errors(caseAttachmentErrors)
		.input(presignUploadSchema)
		.handler(async ({ errors, input }) => {
			const storage = requireStorage();
			const declared = validateCaseImageUpload(input);
			if (declared.kind !== "ok") {
				throwCaseImageViolation(declared, input, errors, "declared");
			}
			const prepared = await prepareCaseAttachmentUpload(input.caseId);
			if (prepared.kind !== "ok") {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			// 显式只传 contentType，不把整个 input 递进去：key 生成函数**永远**
			// 看不到 fileName，读代码的人一眼就能确认这一点。
			const storageKey = buildCaseAttachmentStorageKey(prepared.scope, {
				contentType: input.contentType,
			});
			const uploadUrl = await storage.presignUpload(
				storageKey,
				input.contentType
			);
			return { storageKey, uploadUrl };
		}),

	/**
	 * 前端直传成功后登记元数据，返回新建的附件行——前端拿它的 `id` 拼出
	 * `![](attachment:<id>)` 插进正文（`../lib/case-attachment-ref.ts`）。
	 *
	 * **落库前先 `HeadObject` 读回对象的真实 size 与 contentType，并以它为准。**
	 * 这是「预签名 URL 一旦发出就管不住」那个洞的补法。归属校验为什么必须先于
	 * 任何碰对象的操作、违规对象为什么先删后抛，写在 `../lib/case-attachment-ingest.ts`
	 * 的文件头。
	 *
	 * **不发实时失效事件**：此刻正文还没保存，这一行对别人来说什么都没改变，
	 * 发出去只会让所有在看这条用例的人白刷一次。真正需要别人刷新的时刻是
	 * 正文保存成功（`cases.update` 自己会发 `entity: "case"`），
	 * 前端让附件列表查询跟着那个事件失效即可（见 `list` 的缓存契约）。
	 */
	register: protectedProcedure
		.errors(caseAttachmentErrors)
		.input(registerSchema)
		.handler(async ({ context, errors, input }) => {
			const storage = requireStorage();
			// 这次查询只为拿到 projectId 去验 key 归属；归属校验与对象校验的顺序
			// 由 verifyUploadedCaseImage 保证，理由见那个文件的头注释。
			const prepared = await prepareCaseAttachmentUpload(input.caseId);
			if (prepared.kind !== "ok") {
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			const verified = await verifyUploadedCaseImage(
				{
					scope: prepared.scope,
					storage,
					storageKey: input.storageKey,
				},
				errors
			);
			const result = await registerCaseAttachment({
				caseId: input.caseId,
				contentType: verified.contentType,
				createdBy: context.user.id,
				fileName: input.fileName,
				isStorageKeyOwned: (scope) =>
					isCaseAttachmentKeyOwnedBy(input.storageKey, scope),
				sizeBytes: verified.sizeBytes,
				storageKey: input.storageKey,
			});
			if (result.kind === "invalid-storage-key") {
				throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例" });
			}
			if (result.kind !== "registered") {
				// 用例在 HeadObject 之后被并发删除了。对象留在 bucket 里成为孤儿——
				// 不在这里删：它的内容合法，只是来晚了，交给按前缀的批量清理更稳妥。
				throw errors.NOT_FOUND({ message: "用例不存在" });
			}
			return result.attachment;
		}),

	/**
	 * 附件存储是否可用。**只有一个布尔，别往里加第二个字段。**
	 *
	 * 与 `testRunAttachments.storageStatus` 重复一份，而不是让用例编辑器去调
	 * 一个测试任务的路由：那种跨领域调用会让「测试任务附件」这条链路的任何改动
	 * 都可能悄悄影响用例编辑器。两行代码换一条清晰的领域边界。
	 *
	 * ⚠️ 返回体里**绝不能**出现 bucket 名、endpoint、account id、密钥或其任何
	 * 片段乃至长度。「存储不可用」是给普通成员看的界面状态，不是运维诊断接口。
	 * 同理这里**不发任何真实的 R2 网络请求**——只读环境变量齐不齐。
	 *
	 * 前端据此在没配 R2 时给出明确提示（粘贴时弹「附件存储未配置」），
	 * 而不是让用户粘完图看着它静默失败。
	 */
	storageStatus: protectedProcedure.handler((): { configured: boolean } => ({
		configured: isR2Configured(),
	})),
};
