import {
	extractCaseAttachmentIds,
	isCaseAttachmentRef,
} from "@automationstack/api/lib/case-attachment-ref";
import { MAX_STEP_SCREENSHOTS } from "@automationstack/api/schemas/case";
import type {
	CaseStep,
	CaseStepScreenshotKey,
} from "@automationstack/db/schema/test-cases";

import {
	CASE_IMAGE_CONTENT_TYPES,
	precheckCaseImage,
} from "@/components/cases/case-attachment-policy";
import { extractCaseUploadingToken } from "@/components/cases/case-upload-placeholder";
import type { CaseUploadJobs } from "@/components/cases/use-case-upload-jobs";
import type { MediaItem } from "@/components/media/media-item";

/**
 * 一组截图的条目：已上传的截图是用例附件 id；上传中的截图是上传占位（![](uploading:<token>)），
 * 与正文中的占位相同，所以粘贴的上传队列可以直接写入这一组。上传成功后占位换成附件 id。
 */
export type ScreenshotEntry = string;

/** 两组截图的名称，见 CONTEXT.md。 */
export const SCREENSHOT_GROUP_LABELS: Record<CaseStepScreenshotKey, string> = {
	actionScreenshots: "操作截图",
	expectedScreenshots: "预期截图",
};

/** 「+」按钮的文件选择只接受这些类型，与用例图片相同。 */
export const SCREENSHOT_ACCEPT = CASE_IMAGE_CONTENT_TYPES.join(",");

const NO_ENTRIES: readonly ScreenshotEntry[] = [];

export function screenshotEntries(
	step: CaseStep,
	key: CaseStepScreenshotKey
): readonly ScreenshotEntry[] {
	return step[key] ?? NO_ENTRIES;
}

/** 上传队列插入的文字是一行一个占位。每个占位加到这一组的末尾。 */
export function insertScreenshotEntries(
	entries: readonly ScreenshotEntry[],
	text: string
): ScreenshotEntry[] {
	const added = text.split("\n").filter((line) => line.length > 0);
	return [...entries, ...added];
}

/**
 * 把一个条目换成另一个：上传成功时 to 是附件引用，换成附件 id，位置不变；to 为空时删除这个条目。
 * 找不到 from 时返回原来的列表。
 */
export function replaceScreenshotEntry(
	entries: readonly ScreenshotEntry[],
	from: string,
	to: string
): readonly ScreenshotEntry[] {
	const at = entries.indexOf(from);
	if (at === -1) {
		return entries;
	}
	const next = [...entries];
	if (to === "") {
		next.splice(at, 1);
		return next;
	}
	next[at] = isCaseAttachmentRef(to)
		? (extractCaseAttachmentIds(to)[0] ?? to)
		: to;
	return next;
}

export interface ScreenshotAddPlan {
	accepted: File[];
	/** 说明被拒绝的文件和原因。所有文件都被接受时为 null。 */
	error: string | null;
}

/** 浏览器端先检查类型、大小和数量。existing 是这一组已有的截图数量，包括上传中的截图。 */
export function planScreenshotAdd(
	files: readonly File[],
	existing: number,
	label: string
): ScreenshotAddPlan {
	const accepted: File[] = [];
	const reasons: string[] = [];
	let overLimit = 0;
	for (const file of files) {
		const precheck = precheckCaseImage(file);
		if (!precheck.ok) {
			reasons.push(`${file.name || "图片"}：${precheck.reason}`);
		} else if (existing + accepted.length >= MAX_STEP_SCREENSHOTS) {
			overLimit += 1;
		} else {
			accepted.push(file);
		}
	}
	if (overLimit > 0) {
		reasons.push(
			`每个步骤最多 ${MAX_STEP_SCREENSHOTS} 张${label}，${overLimit} 张没有加入`
		);
	}
	return { accepted, error: reasons.length === 0 ? null : reasons.join("；") };
}

function uploadStatus(
	token: string,
	uploads: CaseUploadJobs
): MediaItem["status"] {
	const job = uploads.get(token);
	return job === undefined || job.status === "failed" ? "failed" : "uploading";
}

/**
 * 一组截图的缩略图：名称是组名和序号，例如「操作截图 2」。
 * 上传中的截图用本地的预览地址；没有上传任务的占位（例如从草稿恢复）显示为上传失败。
 */
export function screenshotMediaItems(
	entries: readonly ScreenshotEntry[],
	label: string,
	imageUrls: ReadonlyMap<string, string | null>,
	uploads: CaseUploadJobs
): MediaItem[] {
	return entries.map((entry, index) => {
		const token = extractCaseUploadingToken(entry);
		const item: MediaItem = {
			id: entry,
			kind: "image",
			name: `${label} ${index + 1}`,
			url: imageUrls.get(token ?? entry) ?? null,
		};
		return token === undefined
			? item
			: { ...item, status: uploadStatus(token, uploads) };
	});
}

/** 缩略图条的无障碍名称和大图浏览标题的前一部分，例如「第 2 步操作截图」和「第 2 步 · 操作截图」。 */
export function screenshotGroupNames(
	position: number,
	key: CaseStepScreenshotKey
): { groupLabel: string; label: string; titlePrefix: string } {
	const groupLabel = SCREENSHOT_GROUP_LABELS[key];
	return {
		groupLabel,
		label: `第 ${position} 步${groupLabel}`,
		titlePrefix: `第 ${position} 步 · ${groupLabel}`,
	};
}
