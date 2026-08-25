import { resolveUserFromBearer } from "../../auth/bearer";
import {
	ingestAttachmentPresignRequestSchema,
	ingestAttachmentRegisterRequestSchema,
} from "./attachment-contract";
import {
	type IngestAttachmentPresignOutcome,
	presignParsed,
} from "./attachment-presign";
import {
	type IngestAttachmentRegisterOutcome,
	registerParsed,
} from "./attachment-register";
import { formatIngestIssues } from "./format-issues";

/**
 * 自动化附件通道的**入口**（plan §5.6）：`POST /ingest/attachments/presign`
 * 与 `POST /ingest/attachments/register`。
 *
 * 结构与 `./execution-ingest` 逐条对齐：外部来的、没有会话 cookie 的请求，
 * 不走 `createContext`、不走 oRPC，鉴权只用 `resolveUserFromBearer`
 * （现有的 `presignUpload` 走 `protectedProcedure`，token 进不去，这才是
 * 这两条新路由存在的全部理由）。HTTP 层（`apps/server`）只剩
 * 「取头、取体、把类型化结果映射成状态码」。
 *
 * 本文件只剩这条通道**共有的那三步**：鉴权 → schema 校验 → 交给编排。
 * 两个端点各自的编排在 `./attachment-presign` 与 `./attachment-register`，
 * 它们的导出**在本文件原样再导出一遍**，调用方（`apps/server`）沿用同一个
 * import 路径，拆分不构成对外的破坏性改动。
 *
 * 这条链路上 import 了 db repository，**因此不可单测**（api 的 vitest project
 * 没有 `DATABASE_URL`）。所以编排里刻意只剩「按顺序调用 + 传参」——
 * 会写错的判断（按 run_case 展开、配额、拒绝理由、对象校验的顺序）
 * 全在 `./attachment-reconcile` 及其兄弟模块，那边是纯的、有单测。
 *
 * ## 为什么是两阶段，而不是一次请求搞定
 *
 * 与手工上传同构且**必须**同构：presign 完根本没传就登记，会在报告页上造出
 * 一行永远加载不出来的幽灵图（`routers/test-run-attachments.ts` 已经点名）。
 * 所以 `register` 落库前必须 `HeadObject` 读回对象的真实 size / contentType——
 * 而那要求对象已经躺在 bucket 里，也就必然是第二次请求。
 *
 * ## R2 未配置时的降级（§5.6 / 第二期 D9 同构）
 *
 * `getR2Storage()` 返回 null 时**不抛、不 500**：两个端点都照常返回 200，
 * `storageConfigured: false`，每条请求项各带一条说明。附件传不上去不能拖垮
 * 整次上报——结论那一轮早就写进去了，把这里做成 5xx 会让 SDK 把一次成功的
 * 上报判成失败。
 */

export type { IngestAttachmentPresignOutcome } from "./attachment-presign";
export type { IngestAttachmentRegisterOutcome } from "./attachment-register";

export interface HandleIngestAttachmentPresignInput {
	/** `Authorization: Bearer as_xxx` 原样；解析与校验在 `resolveUserFromBearer`。 */
	authorizationHeader: string | null;
	/** 已 `JSON.parse` 的请求体，未经校验。schema 在本层跑，HTTP 层不做业务校验。 */
	body: unknown;
}

/**
 * `POST /ingest/attachments/presign`：按 sourceRef 请求，**按解析出的 run_case
 * 逐个返回 URL**（§5.6）。
 *
 * 同一条 sourceRef 可能落在多个未提交任务里（D33），而 key 规则含
 * `{runId}/{runCaseId}`，所以每个 run_case 各上传一份、各自独立的 object，
 * SDK 拿到几个 URL 就传几次同一个文件。看着浪费，但另一条路要给附件删除
 * 引入引用计数，而现有删除路径完全没有这个概念——理由写在
 * `./attachment-reconcile` 的文件头，**不要重新论证**。
 */
export async function handleIngestAttachmentPresign(
	input: HandleIngestAttachmentPresignInput
): Promise<IngestAttachmentPresignOutcome> {
	// 鉴权在校验之前：没通过鉴权的调用方不该从 400 的字段名里读出请求体长什么样。
	const user = await resolveUserFromBearer(input.authorizationHeader);
	if (user === null) {
		return { kind: "unauthorized" };
	}
	const parsed = ingestAttachmentPresignRequestSchema.safeParse(input.body);
	if (!parsed.success) {
		return {
			kind: "invalid-payload",
			message: formatIngestIssues(parsed.error),
		};
	}
	return await presignParsed(parsed.data);
}

export interface HandleIngestAttachmentRegisterInput {
	authorizationHeader: string | null;
	body: unknown;
}

/**
 * `POST /ingest/attachments/register`：直传完成后登记元数据（§5.6）。
 *
 * 落库前先 `HeadObject` 读回对象的真实 size 与 contentType 并以它为准——
 * 预签名 URL 一发出去就管不住实际传了什么，但 bucket 里躺着的东西是客观事实。
 * 它同时堵住了「presign 完根本没传就直接 register」造出的幽灵行。
 */
export async function handleIngestAttachmentRegister(
	input: HandleIngestAttachmentRegisterInput
): Promise<IngestAttachmentRegisterOutcome> {
	const user = await resolveUserFromBearer(input.authorizationHeader);
	if (user === null) {
		return { kind: "unauthorized" };
	}
	const parsed = ingestAttachmentRegisterRequestSchema.safeParse(input.body);
	if (!parsed.success) {
		return {
			kind: "invalid-payload",
			message: formatIngestIssues(parsed.error),
		};
	}
	return await registerParsed(parsed.data, user);
}
