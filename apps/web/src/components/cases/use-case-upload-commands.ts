import { buildCaseAttachmentRef } from "@automationstack/api/lib/case-attachment-ref";
import { useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";

import { precheckCaseImage } from "@/components/cases/case-attachment-policy";
import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";
import {
	CASE_FALLBACK_FILE_NAME,
	CASE_IMAGE_BATCH_LIMIT,
	type CaseImageUpload,
	type CaseImageUploadResult,
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
	/** 正在上传的 token。重复点击「重试」不会重复上传。 */
	inFlight: Set<string>;
	jobs: CaseUploadJobActions;
	records: UploadRecords;
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
	try {
		return await runner.upload(file, (fraction) =>
			runner.jobs.progress(token, fraction)
		);
	} catch (error) {
		return {
			kind: "failed",
			reason: error instanceof Error ? error.message : "上传失败",
		};
	}
}

/** 上传一张图片。成功时占位换成附件引用；失败时保留占位和原因，等用户重试或移除。 */
async function runOneUpload(
	runner: UploadRunner,
	token: string
): Promise<CaseImageUploadResult["kind"] | null> {
	const record = runner.records.get(token);
	if (record === undefined || runner.inFlight.has(token)) {
		return null;
	}
	runner.inFlight.add(token);
	runner.jobs.start(token);
	const result = await uploadSafely(runner, token, record.file);
	runner.inFlight.delete(token);
	if (result.kind === "ok") {
		runner.actions.rename(token, result.attachmentId);
		record.target.replace(
			buildCaseUploadingRef(token),
			buildCaseAttachmentRef(result.attachmentId)
		);
		runner.records.delete(token);
		runner.jobs.remove(token);
		return result.kind;
	}
	if (result.kind === "failed") {
		toast.error(`${record.fileName}：${result.reason}`);
		runner.jobs.fail(token, result.reason, true);
		return result.kind;
	}
	runner.jobs.fail(token, STORAGE_UNAVAILABLE_REASON, false);
	return result.kind;
}

async function runUploads(runner: UploadRunner, tokens: readonly string[]) {
	let storageUnavailable = false;
	for (const token of tokens) {
		if (storageUnavailable) {
			runner.jobs.fail(token, STORAGE_UNAVAILABLE_REASON, false);
			continue;
		}
		// biome-ignore lint/performance/noAwaitInLoops: 串行是刻意的，理由与 use-case-attachment-upload.ts 里那条相同——预签名只有 5 分钟有效期，并发抢上行带宽会把每一个都拖到过期
		const kind = await runOneUpload(runner, token);
		storageUnavailable = kind === "storage-unavailable";
	}
}

function reportPasteCrash() {
	toast.error("图片上传中断，请重试");
}

/** 为每张通过检查的图片插入占位，再按顺序上传。 */
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
		runner.jobs.queue(token, fileName);
		return token;
	});
	target.insert(tokens.map(buildCaseUploadingRef).join("\n"));
	runUploads(runner, tokens).catch(reportPasteCrash);
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
	const records = useRef<UploadRecords>(new Map());
	const inFlight = useRef(new Set<string>());
	const runner = useMemo<UploadRunner>(
		() => ({
			actions,
			inFlight: inFlight.current,
			jobs: jobActions,
			records: records.current,
			upload,
		}),
		[actions, jobActions, upload]
	);

	const uploadPasted = useCallback(
		(files: File[], target: CasePasteTarget) =>
			startPasteUploads(runner, files, target),
		[runner]
	);

	const retryUpload = useCallback(
		(token: string) => {
			runOneUpload(runner, token).catch(reportPasteCrash);
		},
		[runner]
	);

	const discardUpload = useCallback(
		(token: string) => {
			runner.records
				.get(token)
				?.target.replace(buildCaseUploadingRef(token), "");
			runner.records.delete(token);
			actions.release(token);
			jobActions.remove(token);
		},
		[actions, jobActions, runner]
	);

	return { discardUpload, retryUpload, uploadPasted };
}
