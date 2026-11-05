import { MAX_COLUMN_SCREENSHOTS } from "@automationstack/api/schemas/case";
import type {
	CaseStep,
	ColumnScreenshotKey,
} from "@automationstack/db/schema/test-cases";
import { type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import {
	buildCaseUploadingRef,
	extractCaseUploadingToken,
} from "@/components/cases/case-upload-placeholder";
import {
	insertScreenshotEntries,
	planScreenshotAdd,
	replaceScreenshotEntry,
	SCREENSHOT_GROUP_LABELS,
	type ScreenshotEntry,
	screenshotEntries,
} from "@/components/cases/column-screenshot-group";
import type { CasePasteTarget } from "@/components/cases/use-case-upload-commands";

export type StepChange = (id: string, patch: Partial<CaseStep>) => void;

interface GroupEntries {
	/** 写入后、下一次渲染前的条目。上传队列在同一轮中连续写入时读到最新的条目。 */
	pending: readonly ScreenshotEntry[] | null;
	seen: readonly ScreenshotEntry[];
}

interface GroupTargetRefs {
	changeRef: RefObject<StepChange | null>;
	group: ColumnScreenshotKey;
	stepId: string;
	textRef: RefObject<GroupEntries>;
}

/** 写入目标，加上最新的条目数：连续两次粘贴之间还没有重新渲染时，也按最新的数量检查。 */
interface GroupTarget extends CasePasteTarget {
	count: () => number;
}

function groupTarget({
	changeRef,
	group,
	stepId,
	textRef,
}: GroupTargetRefs): GroupTarget {
	const current = () => textRef.current.pending ?? textRef.current.seen;
	const write = (next: readonly ScreenshotEntry[]) => {
		const change = changeRef.current;
		if (change === null || next === current()) {
			return;
		}
		textRef.current.pending = next;
		change(stepId, { [group]: [...next] });
	};
	return {
		count: () => current().length,
		insert: (text) => write(insertScreenshotEntries(current(), text)),
		replace: (from, to) => write(replaceScreenshotEntry(current(), from, to)),
	};
}

/**
 * 这一组截图的写入目标，与正文字段的写入目标相同：上传队列插入占位，上传完成后换成附件 id。
 * 上传是异步的，所以总是通过 ref 读最新的条目和 onChange。步骤删除后不再写入，避免恢复已删除的步骤。
 */
function useGroupTarget(
	step: CaseStep,
	group: ColumnScreenshotKey,
	onChange: StepChange
) {
	const entries = screenshotEntries(step, group);
	const textRef = useRef<GroupEntries>({ pending: null, seen: entries });
	if (textRef.current.seen !== entries) {
		textRef.current = { pending: null, seen: entries };
	}
	// 步骤删除（组件卸载）后为 null
	const changeRef = useRef<StepChange | null>(onChange);
	changeRef.current = onChange;
	useEffect(() => {
		changeRef.current = onChange;
		return () => {
			changeRef.current = null;
		};
	}, [onChange]);

	const stepId = step.id;
	return useMemo(
		() => groupTarget({ changeRef, group, stepId, textRef }),
		[group, stepId]
	);
}

export interface ColumnScreenshotGroupEdit {
	/** 检查后上传「+」选择的文件或粘贴的图片。超过数量的图片不加入，并提示。 */
	addFiles: (files: File[]) => void;
	/** 附件存储已配置，并且这一组没有满。为 false 时不显示「+」按钮。 */
	canAdd: boolean;
	entries: readonly ScreenshotEntry[];
	/** 删除一个条目。上传中的截图同时取消上传。 */
	remove: (entry: ScreenshotEntry) => void;
	/** 删除一个没有上传任务的占位，例如从草稿恢复的占位。 */
	removeUploadingRef: (token: string) => void;
}

/** 一个步骤的一组截图（操作截图或预期截图）：检查后上传、删除。上传使用正文图片的上传队列。 */
export function useColumnScreenshotGroup(
	step: CaseStep,
	group: ColumnScreenshotKey,
	onChange: StepChange
): ColumnScreenshotGroupEdit {
	const { discardUpload, uploadPasted } = useCaseAttachments();
	const target = useGroupTarget(step, group, onChange);
	const entries = screenshotEntries(step, group);

	const addFiles = useCallback(
		(files: File[]) => {
			if (uploadPasted === null) {
				return;
			}
			const plan = planScreenshotAdd(
				files,
				target.count(),
				SCREENSHOT_GROUP_LABELS[group]
			);
			if (plan.error !== null) {
				toast.error(plan.error);
			}
			if (plan.accepted.length > 0) {
				uploadPasted(plan.accepted, target);
			}
		},
		[group, target, uploadPasted]
	);

	const remove = useCallback(
		(entry: ScreenshotEntry) => {
			const token = extractCaseUploadingToken(entry);
			if (token !== undefined) {
				discardUpload(token);
			}
			target.replace(entry, "");
		},
		[discardUpload, target]
	);

	const removeUploadingRef = useCallback(
		(token: string) => target.replace(buildCaseUploadingRef(token), ""),
		[target]
	);

	return {
		addFiles,
		canAdd: uploadPasted !== null && entries.length < MAX_COLUMN_SCREENSHOTS,
		entries,
		remove,
		removeUploadingRef,
	};
}
