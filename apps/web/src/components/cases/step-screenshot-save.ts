import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { toast } from "sonner";

import type { CaseDraftAttachment } from "@/components/cases/case-draft-parse";
import type {
	ScreenshotUploadOutcome,
	ScreenshotUploadProgress,
	StepScreenshotStore,
} from "@/components/cases/use-step-screenshots";

export function screenshotUploadFailedMessage(failed: number): string {
	return `${failed} 张截图上传失败，用例没有保存。在失败的截图上点击「重试」或「移除」，再保存。`;
}

/** 保存按钮的文字：上传截图时显示进度，例如「上传截图 2/5」。 */
export function saveButtonLabel(
	label: string,
	progress: ScreenshotUploadProgress | null | undefined
): string {
	if (progress === null || progress === undefined) {
		return label;
	}
	return `上传截图 ${progress.done}/${progress.total}`;
}

/**
 * 保存用例前先上传所有新的步骤截图。任何一张失败时提示，返回 failed，调用方不保存用例。
 * 编辑区没有步骤截图时直接返回原来的步骤。
 */
export async function uploadScreenshotsBeforeSave(
	store: StepScreenshotStore | null,
	steps: readonly CaseStep[]
): Promise<ScreenshotUploadOutcome> {
	if (store === null) {
		return { attachments: [], kind: "ok", steps: [...steps] };
	}
	const outcome = await store.uploadAll(steps);
	if (outcome.kind === "failed") {
		toast.error(screenshotUploadFailedMessage(outcome.failed));
	}
	return outcome;
}

/** 合并两组新建用例的附件，按 id 去掉重复。 */
export function mergeDraftAttachments(
	first: readonly CaseDraftAttachment[],
	second: readonly CaseDraftAttachment[]
): CaseDraftAttachment[] {
	const byId = new Map<string, CaseDraftAttachment>();
	for (const attachment of [...first, ...second]) {
		byId.set(attachment.id, attachment);
	}
	return [...byId.values()];
}

/** 草稿不保存步骤截图：写入草稿前去掉每个步骤的 screenshots。 */
export function stepsWithoutScreenshots(
	steps: readonly CaseStep[]
): CaseStep[] {
	return steps.map(({ expected, id, step }) => ({ expected, id, step }));
}

export function hasStepScreenshots(steps: readonly CaseStep[]): boolean {
	return steps.some((step) => (step.screenshots?.length ?? 0) > 0);
}

export const SCREENSHOTS_NOT_IN_DRAFT = "截图不随草稿保存";
