import { buildCaseAttachmentRef } from "@automationstack/api/lib/case-attachment-ref";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { precheckCaseImage } from "@/components/cases/case-attachment-policy";
import { buildCaseUploadingRef } from "@/components/cases/case-upload-placeholder";
import {
	CASE_IMAGE_BATCH_LIMIT,
	type CaseImageUpload,
} from "@/components/cases/use-case-attachment-upload";

export interface CasePasteTarget {
	insert: (text: string) => void;
	replace: (from: string, to: string) => void;
}

const FALLBACK_FILE_NAME = "粘贴的图片";

interface PasteJob {
	file: File;
	token: string;
}

interface LocalUrlActions {
	register: (key: string, url: string) => void;
	release: (key: string) => void;
	rename: (from: string, to: string) => void;
}

function useLocalImageUrls() {
	const [urls, setUrls] = useState<ReadonlyMap<string, string>>(
		() => new Map()
	);
	const latest = useRef(urls);
	latest.current = urls;

	useEffect(
		() => () => {
			for (const url of latest.current.values()) {
				URL.revokeObjectURL(url);
			}
		},
		[]
	);

	const actions = useMemo<LocalUrlActions>(
		() => ({
			register: (key, url) => setUrls((prev) => new Map(prev).set(key, url)),
			release: (key) => {
				const url = latest.current.get(key);
				if (url !== undefined) {
					URL.revokeObjectURL(url);
				}
				setUrls((prev) => {
					if (!prev.has(key)) {
						return prev;
					}
					const next = new Map(prev);
					next.delete(key);
					return next;
				});
			},
			rename: (from, to) =>
				setUrls((prev) => {
					const url = prev.get(from);
					if (url === undefined) {
						return prev;
					}
					const next = new Map(prev);
					next.delete(from);
					next.set(to, url);
					return next;
				}),
		}),
		[]
	);

	return { actions, urls };
}

function takePasteJobs(files: File[], actions: LocalUrlActions): PasteJob[] {
	const jobs: PasteJob[] = [];
	for (const file of files.slice(0, CASE_IMAGE_BATCH_LIMIT)) {
		const precheck = precheckCaseImage(file);
		if (precheck.ok) {
			const token = crypto.randomUUID();
			actions.register(token, URL.createObjectURL(file));
			jobs.push({ file, token });
		} else {
			toast.error(`${file.name || FALLBACK_FILE_NAME}：${precheck.reason}`);
		}
	}
	return jobs;
}

async function runOneUpload(
	job: PasteJob,
	target: CasePasteTarget,
	actions: LocalUrlActions,
	upload: (files: readonly File[]) => Promise<string[]>
) {
	let attachmentId: string | undefined;
	try {
		[attachmentId] = await upload([job.file]);
	} catch {
		toast.error(`${job.file.name || FALLBACK_FILE_NAME}：上传失败，请重试`);
	}
	{
		const placeholder = buildCaseUploadingRef(job.token);
		if (attachmentId === undefined) {
			actions.release(job.token);
			target.replace(placeholder, "");
			return;
		}
		actions.rename(job.token, attachmentId);
		target.replace(placeholder, buildCaseAttachmentRef(attachmentId));
	}
}

async function runUploads(
	jobs: readonly PasteJob[],
	target: CasePasteTarget,
	actions: LocalUrlActions,
	upload: (files: readonly File[]) => Promise<string[]>
) {
	for (const job of jobs) {
		// biome-ignore lint/performance/noAwaitInLoops: 串行是刻意的，理由与 use-case-attachment-upload.ts 里那条相同——预签名只有 5 分钟有效期，并发抢上行带宽会把每一个都拖到过期
		await runOneUpload(job, target, actions, upload);
	}
}

function reportPasteCrash() {
	toast.error("图片上传中断，请重试");
}

export interface CasePasteUpload {
	imageUrls: ReadonlyMap<string, string | null>;
	uploading: boolean;
	uploadPasted: ((files: File[], target: CasePasteTarget) => void) | null;
}

export function useCasePasteUpload(
	uploader: CaseImageUpload,
	serverUrls: ReadonlyMap<string, string | null>
): CasePasteUpload {
	const { actions, urls } = useLocalImageUrls();
	const { storageUnavailable, upload } = uploader;
	const [running, setRunning] = useState(0);

	useEffect(() => {
		for (const key of urls.keys()) {
			if ((serverUrls.get(key) ?? null) !== null) {
				actions.release(key);
			}
		}
	}, [actions, serverUrls, urls]);

	const imageUrls = useMemo<ReadonlyMap<string, string | null>>(() => {
		if (urls.size === 0) {
			return serverUrls;
		}
		const merged = new Map(serverUrls);
		for (const [key, url] of urls) {
			if ((merged.get(key) ?? null) === null) {
				merged.set(key, url);
			}
		}
		return merged;
	}, [serverUrls, urls]);

	const uploadPasted = useCallback(
		(files: File[], target: CasePasteTarget) => {
			const jobs = takePasteJobs(files, actions);
			if (jobs.length === 0) {
				return;
			}
			target.insert(
				jobs.map((job) => buildCaseUploadingRef(job.token)).join("\n")
			);
			setRunning((count) => count + 1);
			runUploads(jobs, target, actions, upload)
				.catch(reportPasteCrash)
				.finally(() => setRunning((count) => count - 1));
		},
		[actions, upload]
	);

	return {
		imageUrls,
		uploading: running > 0,
		uploadPasted: storageUnavailable ? null : uploadPasted,
	};
}
