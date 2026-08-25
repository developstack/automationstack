import type { ReporterConfig } from "./config";
import { ATTACHMENTS_PER_BATCH } from "./contract-limits";
import type {
	IngestAttachmentPresignReceipt,
	IngestAttachmentRegisterItemWire,
	IngestAttachmentRegisterReceipt,
	IngestAttachmentUpload,
} from "./contract-types";
import type { IngestHttpClient } from "./http-client";
import type { AttachmentOutcome, LoadedAttachment } from "./reporter-types";
import {
	INGEST_ATTACHMENTS_PRESIGN_ROUTE,
	INGEST_ATTACHMENTS_REGISTER_ROUTE,
} from "./route-paths";

/**
 * 附件三步：presign → 直传 → register（§5.6 / D28）。
 *
 * **只用 HTTP 客户端，没有 S3 SDK**：预签名 URL 就是一次普通的 PUT，
 * 引一个 S3 SDK 只会给用户的构建加十几兆并撞版本（§7.3 里 Java 那条理由，
 * Node 这边保持一致）。
 *
 * ⚠️ **同一个本地文件会被传多次，这是有意的，不要去做去重**：object key 规则
 * 含 `{runId}/{runCaseId}`，一条 sourceRef 可能落在多个未提交任务里（D33），
 * presign 就会按解析出的 run_case 逐个返回 URL。省下这几份 object 的代价是
 * 给附件删除引入引用计数，那是一条以后一定会踩的坑（§5.6 那段）。
 * 所以这里严格按 `uploads` 的条数上传——`index` 指回请求里的第几个附件。
 */

function buildPresignBody(
	chunk: LoadedAttachment[],
	config: ReporterConfig
): unknown {
	return {
		attachments: chunk.map((item) => ({
			contentType: item.contentType,
			kind: item.kind,
			sizeBytes: item.sizeBytes,
			sourceRef: item.sourceRef,
		})),
		projectId: config.projectId,
		// 与结论那一轮**必须传同一份**：少传一次，附件会挂到本轮结论压根没写过的任务上。
		runIds: config.runIds,
	};
}

interface PutResult {
	failures: string[];
	registerItems: IngestAttachmentRegisterItemWire[];
}

async function putOne(args: {
	chunk: LoadedAttachment[];
	client: IngestHttpClient;
	result: PutResult;
	upload: IngestAttachmentUpload;
}): Promise<void> {
	const { chunk, client, result, upload } = args;
	const source = chunk[upload.index];
	if (!source) {
		// 服务端给回了一个不存在的下标。只可能是契约漂移，逐条记下来而不是抛——
		// 一个坏下标不该让其余几百个附件全丢。
		result.failures.push(
			`${upload.sourceRef}：presign 返回了越界的 index ${upload.index}`
		);
		return;
	}
	try {
		await client.putBinary(upload.uploadUrl, upload.contentType, source.body);
		result.registerItems.push({
			fileName: source.fileName,
			kind: source.kind,
			runCaseId: upload.runCaseId,
			runId: upload.runId,
			storageKey: upload.storageKey,
		});
	} catch (error) {
		// 这一条是**本地**的失败，措辞上明确标出来：与服务端原样透传的拒绝理由
		// 混在一起时，人得能一眼分清该去查网络还是去查平台。
		result.failures.push(
			`${upload.sourceRef} @《${upload.runName}》：（本地）直传失败 ${String(error)}`
		);
	}
}

function formatPresignRejections(
	receipt: IngestAttachmentPresignReceipt
): string[] {
	return receipt.rejected.map((rejection) => {
		const target = rejection.runName ? ` @《${rejection.runName}》` : "";
		// reason 原样，一个字不改（§7.2 第 4 条）。
		return `${rejection.sourceRef}${target}：${rejection.reason}`;
	});
}

function chunkAttachments(items: LoadedAttachment[]): LoadedAttachment[][] {
	const chunks: LoadedAttachment[][] = [];
	for (let start = 0; start < items.length; start += ATTACHMENTS_PER_BATCH) {
		chunks.push(items.slice(start, start + ATTACHMENTS_PER_BATCH));
	}
	return chunks;
}

async function uploadChunk(args: {
	chunk: LoadedAttachment[];
	client: IngestHttpClient;
	config: ReporterConfig;
	outcome: AttachmentOutcome;
}): Promise<void> {
	const { chunk, client, config, outcome } = args;
	const presigned = await client.postJson<IngestAttachmentPresignReceipt>(
		INGEST_ATTACHMENTS_PRESIGN_ROUTE,
		buildPresignBody(chunk, config)
	);
	outcome.storageConfigured &&= presigned.storageConfigured;
	outcome.rejections.push(...formatPresignRejections(presigned));
	const putResult: PutResult = { failures: [], registerItems: [] };
	for (const upload of presigned.uploads) {
		// biome-ignore lint/performance/noAwaitInLoops: 串行直传，几百个附件并发会把 QA 本机的上行打满
		await putOne({ chunk, client, result: putResult, upload });
	}
	outcome.rejections.push(...putResult.failures);
	outcome.uploaded += putResult.registerItems.length;
	if (putResult.registerItems.length === 0) {
		return;
	}
	const registered = await client.postJson<IngestAttachmentRegisterReceipt>(
		INGEST_ATTACHMENTS_REGISTER_ROUTE,
		{ attachments: putResult.registerItems }
	);
	outcome.registered += registered.registered.length;
	outcome.rejections.push(
		...registered.rejected.map(
			(rejection) => `${rejection.storageKey}：${rejection.reason}`
		)
	);
}

/**
 * ⚠️ **附件传不上去不能拖垮整次上报**（§5.6，与第二期 D9 同构）。
 * 所以这里对每一批各自兜住异常：结论那一轮早就写进去了，
 * 让一个连不上的 R2 把一次成功的上报判成失败是最没道理的失败方式。
 */
export async function uploadAttachments(args: {
	attachments: LoadedAttachment[];
	client: IngestHttpClient;
	config: ReporterConfig;
}): Promise<AttachmentOutcome> {
	const outcome: AttachmentOutcome = {
		registered: 0,
		rejections: [],
		storageConfigured: true,
		uploaded: 0,
	};
	for (const chunk of chunkAttachments(args.attachments)) {
		try {
			// biome-ignore lint/performance/noAwaitInLoops: 每批各自兜异常，附件失败不能拖垮整次上报（§5.6）
			await uploadChunk({
				chunk,
				client: args.client,
				config: args.config,
				outcome,
			});
		} catch (error) {
			outcome.rejections.push(`（本地）附件这一批整批失败：${String(error)}`);
		}
	}
	return outcome;
}
