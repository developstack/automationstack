import type { ReporterConfig } from "./config.js";
import { ATTACHMENTS_PER_BATCH } from "./contract-limits.js";
import type {
	IngestAttachmentPresignReceipt,
	IngestAttachmentRegisterItemWire,
	IngestAttachmentRegisterReceipt,
	IngestAttachmentUpload,
} from "./contract-types.js";
import type { IngestHttpClient } from "./http-client.js";
import type { AttachmentOutcome, LoadedAttachment } from "./reporter-types.js";
import {
	INGEST_ATTACHMENTS_PRESIGN_ROUTE,
	INGEST_ATTACHMENTS_REGISTER_ROUTE,
} from "./route-paths.js";

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
