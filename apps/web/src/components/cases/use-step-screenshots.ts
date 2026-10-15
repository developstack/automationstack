import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import {
	localScreenshotIds,
	newLocalScreenshotId,
	resolveStepScreenshots,
	runWithConcurrency,
	SCREENSHOT_UPLOAD_CONCURRENCY,
} from "@/components/cases/step-screenshots";
import type {
	CaseImageUpload,
	CaseImageUploadResult,
} from "@/components/cases/use-case-attachment-upload";

export type LocalScreenshotStatus =
	| "failed"
	| "pending"
	| "uploaded"
	| "uploading";

/** 一张还没有保存的步骤截图：文件只在浏览器内存中，用本地的 blob 地址显示。 */
export interface LocalScreenshot {
	attachmentId: string | null;
	/** 新建用例的草稿上传流程返回的附件信息。创建用例时一起提交。 */
	draft: CaseDraftAttachment | null;
	error: string | null;
	file: File;
	status: LocalScreenshotStatus;
	url: string;
}

export interface ScreenshotUploadProgress {
	done: number;
	total: number;
}

export type ScreenshotUploadOutcome =
	| { attachments: CaseDraftAttachment[]; kind: "ok"; steps: CaseStep[] }
	| { failed: number; kind: "failed" };

export interface StepScreenshotStore {
	/** 加入文件并返回它们的本地 id。文件不上传。 */
	add: (files: readonly File[]) => string[];
	/** 附件存储（R2）已配置，可以添加截图。 */
	available: boolean;
	clear: () => void;
	discard: (id: string) => void;
	progress: ScreenshotUploadProgress | null;
	/** 只重新上传这一张失败的截图。 */
	retry: (id: string) => void;
	shots: ReadonlyMap<string, LocalScreenshot>;
	/** 上传步骤中所有还没有上传的截图，然后返回换成附件 id 的步骤。 */
	uploadAll: (steps: readonly CaseStep[]) => Promise<ScreenshotUploadOutcome>;
}

const STORAGE_UNAVAILABLE_REASON = "附件存储（R2）未配置";

const IGNORE = (): void => undefined;

function failureReason(result: CaseImageUploadResult): string {
	if (result.kind === "failed") {
		return result.reason;
	}
	return STORAGE_UNAVAILABLE_REASON;
}

/** 本地截图的集合。读写都经过 ref，所以异步的上传总是看到最新的状态。 */
function useShotMap() {
	const ref = useRef(new Map<string, LocalScreenshot>());
	const [shots, setShots] = useState<ReadonlyMap<string, LocalScreenshot>>(
		() => new Map()
	);
	const publish = useCallback(() => setShots(new Map(ref.current)), []);
	const patch = useCallback(
		(id: string, change: Partial<LocalScreenshot>) => {
			const shot = ref.current.get(id);
			if (shot !== undefined) {
				ref.current.set(id, { ...shot, ...change });
				publish();
			}
		},
		[publish]
	);
	useEffect(
		() => () => {
			for (const shot of ref.current.values()) {
				URL.revokeObjectURL(shot.url);
			}
		},
		[]
	);
	return { patch, publish, ref, shots };
}

function useShotUpload(
	uploader: CaseImageUpload,
	map: ReturnType<typeof useShotMap>
) {
	const uploaderRef = useRef(uploader);
	uploaderRef.current = uploader;
	const { patch, ref } = map;
	return useCallback(
		async (id: string): Promise<void> => {
			const shot = ref.current.get(id);
			if (shot === undefined || shot.status === "uploaded") {
				return;
			}
			patch(id, { error: null, status: "uploading" });
			const result = await uploaderRef.current.upload(shot.file, IGNORE);
			if (result.kind === "ok") {
				patch(id, {
					attachmentId: result.attachmentId,
					draft: result.draft ?? null,
					status: "uploaded",
				});
				return;
			}
			patch(id, { error: failureReason(result), status: "failed" });
		},
		[patch, ref]
	);
}

function outcomeOf(
	steps: readonly CaseStep[],
	ids: readonly string[],
	shots: ReadonlyMap<string, LocalScreenshot>
): ScreenshotUploadOutcome {
	const uploaded = new Map<string, string>();
	const attachments: CaseDraftAttachment[] = [];
	for (const id of ids) {
		const shot = shots.get(id);
		if (shot === undefined) {
			continue;
		}
		if (shot.attachmentId !== null) {
			uploaded.set(id, shot.attachmentId);
		}
		if (shot.draft !== null) {
			attachments.push(shot.draft);
		}
	}
	const failed = ids.length - uploaded.size;
	if (failed > 0) {
		return { failed, kind: "failed" };
	}
	return {
		attachments,
		kind: "ok",
		steps: resolveStepScreenshots(steps, uploaded),
	};
}

function useUploadAll(
	map: ReturnType<typeof useShotMap>,
	uploadOne: (id: string) => Promise<void>
) {
	const [progress, setProgress] = useState<ScreenshotUploadProgress | null>(
		null
	);
	const uploadAll = useCallback(
		async (steps: readonly CaseStep[]): Promise<ScreenshotUploadOutcome> => {
			const ids = localScreenshotIds(steps);
			const todo = ids.filter(
				(id) => map.ref.current.get(id)?.status !== "uploaded"
			);
			if (todo.length > 0) {
				let done = 0;
				setProgress({ done, total: todo.length });
				await runWithConcurrency(
					todo,
					SCREENSHOT_UPLOAD_CONCURRENCY,
					async (id) => {
						await uploadOne(id);
						done += 1;
						setProgress({ done, total: todo.length });
					}
				);
				setProgress(null);
			}
			return outcomeOf(steps, ids, map.ref.current);
		},
		[map.ref, uploadOne]
	);
	return { progress, uploadAll };
}

function useShotEdits(map: ReturnType<typeof useShotMap>) {
	const { publish, ref } = map;
	const add = useCallback(
		(files: readonly File[]) => {
			const ids = files.map((file) => {
				const id = newLocalScreenshotId();
				ref.current.set(id, {
					attachmentId: null,
					draft: null,
					error: null,
					file,
					status: "pending",
					url: URL.createObjectURL(file),
				});
				return id;
			});
			publish();
			return ids;
		},
		[publish, ref]
	);
	const discard = useCallback(
		(id: string) => {
			const shot = ref.current.get(id);
			if (shot !== undefined) {
				URL.revokeObjectURL(shot.url);
				ref.current.delete(id);
				publish();
			}
		},
		[publish, ref]
	);
	const clear = useCallback(() => {
		for (const id of [...ref.current.keys()]) {
			discard(id);
		}
	}, [discard, ref]);
	return { add, clear, discard };
}

/** 编辑区中所有步骤的本地截图：加入、删除、保存时上传，以及重试失败的上传。 */
export function useStepScreenshots(
	uploader: CaseImageUpload
): StepScreenshotStore {
	const map = useShotMap();
	const { add, clear, discard } = useShotEdits(map);
	const uploadOne = useShotUpload(uploader, map);
	const { progress, uploadAll } = useUploadAll(map, uploadOne);

	const retry = useCallback(
		(id: string) => {
			uploadOne(id).catch(IGNORE);
		},
		[uploadOne]
	);

	return useMemo(
		() => ({
			add,
			available: !uploader.storageUnavailable,
			clear,
			discard,
			progress,
			retry,
			shots: map.shots,
			uploadAll,
		}),
		[
			add,
			clear,
			discard,
			progress,
			map.shots,
			retry,
			uploadAll,
			uploader.storageUnavailable,
		]
	);
}
