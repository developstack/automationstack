import { buildCaseAttachmentRef } from "@automationstack/api/lib/case-attachment-ref";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { precheckCaseImage } from "@/components/cases/case-attachment-policy";
import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";
import {
	CASE_FALLBACK_FILE_NAME,
	CASE_IMAGE_BATCH_LIMIT,
	type CaseImageUpload,
	type CaseImageUploadResult,
	caseUploadFailure,
} from "@/components/cases/use-case-attachment-upload";
import type { CaseUploadJobActions } from "@/components/cases/use-case-upload-jobs";
import type { LocalUrlActions } from "@/components/cases/use-local-image-urls";

export interface CasePasteTarget {
	insert: (text: string) => void;
	replace: (from: string, to: string) => void;
}

const STORAGE_UNAVAILABLE_REASON = "附件存储未配置";

interface UploadRecord {
	file: File;
	fileName: string;
	target: CasePasteTarget;
}

type UploadRecords = Map<string, UploadRecord>;

interface UploadRunner {
	actions: LocalUrlActions;
	/** 所有上传排成一个队列，一次只上传一张：预签名只有 5 分钟有效期，同时上传会抢带宽，可能都过期。 */
	enqueue: (task: () => Promise<void>) => void;
	jobs: CaseUploadJobActions;
	/** 排队中或上传中的 token。重复点击「重试」不会重复上传。 */
	pending: Set<string>;
	records: UploadRecords;
	/** 附件存储未配置后，队列中其余的图片直接失败，不再请求。 */
	storageDown: { current: boolean };
	upload: CaseImageUpload["upload"];
}

function takePasteFiles(files: File[]): File[] {
	const accepted: File[] = [];
	for (const file of files.slice(0, CASE_IMAGE_BATCH_LIMIT)) {
		const precheck = precheckCaseImage(file);
		if (precheck.ok) {
			accepted.push(file);
		} else {
			toast.error(
				`${file.name || CASE_FALLBACK_FILE_NAME}：${precheck.reason}`
			);
		}
	}
	return accepted;
}

async function uploadSafely(
	runner: UploadRunner,
	token: string,
	file: File
): Promise<CaseImageUploadResult> {
	if (runner.storageDown.current) {
		return { kind: "storage-unavailable" };
	}
	try {
		return await runner.upload(file, (fraction) =>
			runner.jobs.progress(token, fraction)
		);
	} catch (error) {
		return caseUploadFailure(error);
	}
}

function finishUpload(
	runner: UploadRunner,
	token: string,
	record: UploadRecord,
	result: CaseImageUploadResult
) {
	if (result.kind === "ok") {
		runner.actions.rename(token, result.attachmentId);
		record.target.replace(
			buildCaseUploadingRef(token),
			buildCaseAttachmentRef(result.attachmentId)
		);
		runner.records.delete(token);
		runner.jobs.remove(token);
		return;
	}
	if (result.kind === "failed") {
		toast.error(`${record.fileName}：${result.reason}`);
		runner.jobs.fail(token, result.reason, true);
		return;
	}
	runner.storageDown.current = true;
	runner.jobs.fail(token, STORAGE_UNAVAILABLE_REASON, false);
}

/** 把一张图片放进上传队列。成功时占位换成附件引用；失败时保留占位和原因，等用户重试或移除。 */
function queueUpload(runner: UploadRunner, token: string) {
	const record = runner.records.get(token);
	if (record === undefined || runner.pending.has(token)) {
		return;
	}
	runner.pending.add(token);
	runner.jobs.queue(token, record.fileName);
	runner.enqueue(async () => {
		if (runner.records.get(token) !== record) {
			runner.pending.delete(token);
			return;
		}
		runner.jobs.start(token);
		const result = await uploadSafely(runner, token, record.file);
		runner.pending.delete(token);
		finishUpload(runner, token, record, result);
	});
}

function reportPasteCrash() {
	toast.error("图片上传中断，请重试");
}

/** 为每张通过检查的图片插入占位，再放进上传队列。 */
function startPasteUploads(
	runner: UploadRunner,
	files: File[],
	target: CasePasteTarget
) {
	const accepted = takePasteFiles(files);
	if (accepted.length === 0) {
		return;
	}
	const tokens = accepted.map((file) => {
		const token = crypto.randomUUID();
		const fileName = file.name || CASE_FALLBACK_FILE_NAME;
		runner.actions.register(token, URL.createObjectURL(file));
		runner.records.set(token, { file, fileName, target });
		return token;
	});
	target.insert(tokens.map(buildCaseUploadingRef).join("\n"));
	for (const token of tokens) {
		queueUpload(runner, token);
	}
}

/** 一个按顺序执行的任务队列。队列空闲时任务立即开始。一个任务失败不影响后面的任务。 */
function createSerialQueue(): UploadRunner["enqueue"] {
	let tail: Promise<void> | null = null;
	return (task) => {
		const run = () => task().catch(reportPasteCrash);
		const next = tail === null ? run() : tail.then(run);
		tail = next;
		next.then(() => {
			if (tail === next) {
				tail = null;
			}
		});
	};
}

export interface CaseUploadCommands {
	discardUpload: (token: string) => void;
	retryUpload: (token: string) => void;
	uploadPasted: (files: File[], target: CasePasteTarget) => void;
}

/** 粘贴、重试和移除图片上传。上传按顺序进行，每张图片的状态写入上传任务。 */
export function useCaseUploadCommands(
	upload: CaseImageUpload["upload"],
	actions: LocalUrlActions,
	jobActions: CaseUploadJobActions
): CaseUploadCommands {
	const uploadRef = useRef(upload);
	uploadRef.current = upload;
	// 队列和记录在整个面板中只有一份。排队中的图片开始上传时读取最新的上传函数。
	const [runner] = useState<UploadRunner>(() => ({
		actions,
		enqueue: createSerialQueue(),
		jobs: jobActions,
		pending: new Set(),
		records: new Map(),
		storageDown: { current: false },
		upload: (file, onProgress) => uploadRef.current(file, onProgress),
	}));

	const uploadPasted = useCallback(
		(files: File[], target: CasePasteTarget) =>
			startPasteUploads(runner, files, target),
		[runner]
	);

	const retryUpload = useCallback(
		(token: string) => queueUpload(runner, token),
		[runner]
	);

	const discardUpload = useCallback(
		(token: string) => {
			runner.records
				.get(token)
				?.target.replace(buildCaseUploadingRef(token), "");
			runner.records.delete(token);
			runner.actions.release(token);
			runner.jobs.remove(token);
		},
		[runner]
	);

	return { discardUpload, retryUpload, uploadPasted };
}
