import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { useCallback } from "react";
import { toast } from "sonner";

import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import {
	isLocalScreenshot,
	planScreenshotAdd,
	stepScreenshots,
} from "@/components/cases/step-screenshots";

export const SCREENSHOT_STORAGE_UNAVAILABLE =
	"附件存储（R2）未配置，无法添加截图";

export interface StepScreenshotEdit {
	/** 加入截图（「+」选择的文件或粘贴的图片）。编辑区没有步骤截图时为 undefined。 */
	addFiles: ((files: File[]) => void) | undefined;
	remove: (id: string) => void;
}

/** 一个步骤的步骤截图：检查后加入、删除。文件只保存在浏览器内存中。 */
export function useStepScreenshotEdit(
	step: CaseStep,
	onChange: (id: string, patch: Partial<CaseStep>) => void
): StepScreenshotEdit {
	const { screenshots: store } = useCaseAttachments();

	const addFiles = useCallback(
		(files: File[]) => {
			if (store === null) {
				return;
			}
			if (!store.available) {
				toast.error(SCREENSHOT_STORAGE_UNAVAILABLE);
				return;
			}
			const current = stepScreenshots(step);
			const plan = planScreenshotAdd(files, current.length);
			if (plan.error !== null) {
				toast.error(plan.error);
			}
			if (plan.accepted.length > 0) {
				const ids = store.add(plan.accepted);
				onChange(step.id, { screenshots: [...current, ...ids] });
			}
		},
		[onChange, step, store]
	);

	const remove = useCallback(
		(id: string) => {
			onChange(step.id, {
				screenshots: stepScreenshots(step).filter((item) => item !== id),
			});
			if (isLocalScreenshot(id)) {
				store?.discard(id);
			}
		},
		[onChange, step, store]
	);

	return { addFiles: store === null ? undefined : addFiles, remove };
}
