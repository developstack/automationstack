import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { useCallback } from "react";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import { StepScreenshotGallery } from "@/components/cases/step-screenshot-gallery";
import { stepScreenshots } from "@/components/cases/step-screenshots";

const DEFAULT_EMPTY_TEXT = "还没有步骤。点击「编辑」添加操作步骤和预期结果。";

interface CaseStepsListProps {
	/** 没有步骤时显示的文字。默认指引用户点击「编辑」添加 */
	emptyText?: string;
	imageUrls: MarkdownImageUrls;
	/** 用户确认删除一张步骤截图后调用。不传时不显示删除按钮。 */
	onRemoveScreenshot?: (stepId: string, attachmentId: string) => void;
	/** 删除正在保存时为 true。 */
	removingScreenshot?: boolean;
	steps: readonly CaseStep[];
}

interface CaseStepItemProps {
	imageUrls: MarkdownImageUrls;
	onRemoveScreenshot?: (stepId: string, attachmentId: string) => void;
	position: number;
	removingScreenshot: boolean;
	step: CaseStep;
}

function CaseStepItem({
	imageUrls,
	onRemoveScreenshot,
	position,
	removingScreenshot,
	step,
}: CaseStepItemProps) {
	const removeScreenshot = useCallback(
		(attachmentId: string) => onRemoveScreenshot?.(step.id, attachmentId),
		[onRemoveScreenshot, step.id]
	);
	return (
		<li className="flex gap-3 rounded-xl border bg-card p-4 text-card-foreground text-sm shadow-card">
			<span className="numeric flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs">
				{position}
			</span>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<MarkdownRender imageUrls={imageUrls} text={step.step} />
				<div className="flex flex-col gap-1">
					<p className="text-muted-foreground text-xs">预期结果</p>
					{step.expected ? (
						<MarkdownRender imageUrls={imageUrls} text={step.expected} />
					) : (
						<p className="text-muted-foreground">—</p>
					)}
				</div>
				<StepScreenshotGallery
					ids={stepScreenshots(step)}
					imageUrls={imageUrls}
					label={`第 ${position} 步截图`}
					onRemove={onRemoveScreenshot ? removeScreenshot : undefined}
					removing={removingScreenshot}
				/>
			</div>
		</li>
	);
}

/** 只读的步骤列表：编号、操作、预期结果和步骤截图。用在用例详情和版本历史的快照查看中。 */
export function CaseStepsList({
	emptyText = DEFAULT_EMPTY_TEXT,
	imageUrls,
	onRemoveScreenshot,
	removingScreenshot = false,
	steps,
}: CaseStepsListProps) {
	if (steps.length === 0) {
		return (
			<p className="rounded-lg border border-dashed px-3 py-4 text-muted-foreground text-sm">
				{emptyText}
			</p>
		);
	}
	return (
		<ol className="flex flex-col gap-3">
			{steps.map((step, index) => (
				<CaseStepItem
					imageUrls={imageUrls}
					key={step.id}
					onRemoveScreenshot={onRemoveScreenshot}
					position={index + 1}
					removingScreenshot={removingScreenshot}
					step={step}
				/>
			))}
		</ol>
	);
}
