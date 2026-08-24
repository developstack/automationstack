import { randomUUID } from "node:crypto";

import { projectExists } from "@automationstack/db/repositories/projects-repository";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { protectedProcedure } from "../index";
import { throwCaseImageViolation } from "../lib/case-attachment-ingest";
import {
	buildCaseAttachmentStorageKey,
	isCaseAttachmentKeyOwnedBy,
	validateCaseImageUpload,
} from "../lib/case-attachment-policy";
import { getR2Storage } from "../lib/r2";

/**
 * **草稿态**贴图的签名接口：用例还没保存、数据库里还没有那条行的时候用。
 *
 * 与 `./case-attachments.ts` 里那四条（`presignUpload` / `register` / `list` /
 * `storageStatus`）是**两条并行的链路**，服务的场景不同：
 * - 那四条服务「编辑已有用例」，caseId 在库里查得到，`projectId` 由服务端反查；
 * - 这两条服务「新建用例」，caseId 是前端 `crypto.randomUUID()` 预生成的，
 *   库里根本不存在，因此 `projectId` 只能由前端一起传上来。
 *
 * 之所以不需要数据库里有那条用例行，全靠 object key 规则
 * `test-cases/{projectId}/{caseId}/{uuid}.{ext}` **本身就编码了归属**：
 * 判定一个 key 属不属于某条用例只看前缀（`isCaseAttachmentKeyOwnedBy`）。
 * 完整的设计取舍写在 `../lib/case-attachment-draft-ingest.ts` 的文件头。
 *
 * ⚠️ 这两条**不能**替代那四条：编辑已有用例时 `projectId` 必须由服务端反查，
 * 让前端传等于多开一个它本来不需要的口子。别为了「少一套接口」把它们合并。
 */

/** 与 `./case-attachments.ts` 保持一致：正整数由 zod 保证，上限交给策略层出文案。 */
const sizeBytesSchema = z.number().int().positive();

/** 展示用的原始文件名，**绝不参与 key 生成**（见 `buildCaseAttachmentStorageKey`）。 */
const fileNameSchema = z.string().min(1).max(255);

/**
 * 一次最多签 50 个下载 URL。
 *
 * 与 `cases.create` 的附件条数上限同一个数：恢复草稿时要签的正是保存时要提交的
 * 那一批，两处对不齐会出现「能恢复但存不进去」或者反过来的怪状态。
 */
const MAX_DRAFT_DOWNLOAD_KEYS = 50;

const presignDraftUploadSchema = z.object({
	/**
	 * 客户端预生成的 caseId，**数据库里还不存在**——所以这条路径刻意
	 * 不去查 `test_cases`，查了必然 404。
	 */
	caseId: z.uuid(),
	contentType: z.string().min(1),
	fileName: fileNameSchema,
	projectId: z.uuid(),
	sizeBytes: sizeBytesSchema,
});

const presignDraftDownloadSchema = z.object({
	caseId: z.uuid(),
	projectId: z.uuid(),
	storageKeys: z.array(z.string().min(1)).min(1).max(MAX_DRAFT_DOWNLOAD_KEYS),
});

/** 一个草稿贴图的现签 GET URL；R2 未配置时 `url` 为 null。 */
export interface DraftAttachmentUrl {
	storageKey: string;
	url: string | null;
}

export const caseAttachmentDraftProcedures = {
	/**
	 * 崩溃恢复用：为草稿正文里引用的那批 key 重新签 GET URL。
	 *
	 * 场景是浏览器意外关闭后从 localStorage 恢复草稿。此刻正文里已经有
	 * `![](attachment:<id>)`，但数据库里**一行都没有**——`caseAttachments.list`
	 * 在这里返回空，帮不上忙。能拿来鉴权的只剩 key 的前缀本身。
	 *
	 * ## 安全边界
	 *
	 * `isCaseAttachmentKeyOwnedBy(key, { caseId, projectId })` 是这条接口的
	 * **唯一**安全边界：它保证签出去的 URL 只可能指向 `test-cases/{projectId}/{caseId}/`
	 * 这个前缀下的对象。少了它，这条接口就是一个「给我任意 key，我还你一个
	 * 可读的签名 URL」的原语——整个 bucket 都会被读干净。
	 * 所以下面这个循环**必须**在拿到 storage 之前、且对**每一个** key 都跑。
	 *
	 * 不合法的 key 选择抛 `BAD_REQUEST` 而不是回 `url: null`：`url: null` 在这条
	 * 链路上已经有确定含义——「存储没配好，先降级显示占位图」，前端据此
	 * 让用户继续编辑。把「你无权访问」也塞进同一个信号，前端就再也分不清
	 * 该降级还是该报错。而且合法客户端根本产生不出越界的 key（它们全部来自
	 * `presignDraftUpload` 的返回值），出现越界只意味着草稿数据坏了或者有人在探测，
	 * 两种情况都该响亮地失败，而不是被静默成一张占位图。
	 *
	 * 一次请求签完整批：`presignDownload` 是纯本地的 SigV4 计算（HMAC + 字符串
	 * 拼接），不发网络请求也不问对象在不在，所以 `Promise.all` 只是 50 次
	 * 几十微秒的哈希。**绝不要**让前端每个 key 发一次请求。
	 */
	presignDraftDownload: protectedProcedure
		.errors({ BAD_REQUEST: {} })
		.input(presignDraftDownloadSchema)
		.handler(async ({ errors, input }): Promise<DraftAttachmentUrl[]> => {
			const scope = { caseId: input.caseId, projectId: input.projectId };
			for (const storageKey of input.storageKeys) {
				if (!isCaseAttachmentKeyOwnedBy(storageKey, scope)) {
					throw errors.BAD_REQUEST({ message: "storageKey 不属于该用例" });
				}
			}
			const storage = getR2Storage();
			// R2 没配时整批回 null 而不是抛：恢复流程要能把正文先还给用户
			// （图变成占位），把整个恢复卡死是最糟的降级方式。
			if (storage === null) {
				return input.storageKeys.map((storageKey) => ({
					storageKey,
					url: null,
				}));
			}
			return await Promise.all(
				input.storageKeys.map(async (storageKey) => ({
					storageKey,
					url: await storage.presignDownload(storageKey),
				}))
			);
		}),

	/**
	 * 为一条**还不存在的**用例签一个 5 分钟的 PUT URL。
	 *
	 * ## 为什么 `attachmentId` 在这一步就生成
	 *
	 * 它就是之后要写进正文 `![](attachment:<id>)` 的那个 id，也是保存时写进
	 * `case_attachments.id` 的主键。之所以不等到保存时再生成：正文引用必须在
	 * **上传成功的那一刻**就插进编辑器，否则用户看不到自己刚粘的图。
	 * 如果 id 到保存时才定，就得回头在正文里做一次文本替换——那段代码会在
	 * 「用户同时手改了正文」时悄悄改错东西，而且是那种只在特定操作时序下
	 * 复现的 bug。id 在这里定死，正文从头到尾只写一次。
	 *
	 * ## 为什么不查 `test_cases`，但要查项目
	 *
	 * caseId 是客户端刚生成的，库里必然查不到，查了只会得到一个必然的 404。
	 * 但 `projectId` 会被拼进 object key，所以它必须是**真实存在的项目**：
	 * 不校验就等于允许往任意编造的前缀下写对象，bucket 里会长出一堆永远不会
	 * 有任何人认领、也无法按项目清理的垃圾；顺带也让用户在传完图之后
	 * 才发现项目不对，而不是当场收到 404。
	 *
	 * 校验全部发生在**签名之前**：URL 一旦发出去就是一张收不回的写入凭证。
	 */
	presignDraftUpload: protectedProcedure
		.errors({ BAD_REQUEST: {}, NOT_FOUND: {} })
		.input(presignDraftUploadSchema)
		.handler(async ({ errors, input }) => {
			const storage = getR2Storage();
			if (storage === null) {
				throw new ORPCError("PRECONDITION_FAILED", {
					message: "附件存储（R2）未配置，无法粘贴图片",
				});
			}
			const declared = validateCaseImageUpload(input);
			if (declared.kind !== "ok") {
				throwCaseImageViolation(declared, input, errors, "declared");
			}
			if (!(await projectExists(input.projectId))) {
				throw errors.NOT_FOUND({ message: "项目不存在" });
			}
			// 显式只传 contentType：key 生成函数**永远**看不到 fileName，
			// 读代码的人一眼就能确认这一点。
			const storageKey = buildCaseAttachmentStorageKey(
				{ caseId: input.caseId, projectId: input.projectId },
				{ contentType: input.contentType }
			);
			const uploadUrl = await storage.presignUpload(
				storageKey,
				input.contentType
			);
			return { attachmentId: randomUUID(), storageKey, uploadUrl };
		}),
};
