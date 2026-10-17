import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { cn } from "@automationstack/ui/lib/utils";
import { useCallback } from "react";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import {
	STEP_GRID_CLASS,
	StepGridHeader,
} from "@/components/cases/step-grid-header";
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

interface StepCellProps {
	imageUrls: MarkdownImageUrls;
	label: string;
	text: string;
}

/** 一栏的内容。宽屏时列标题在表头，这里的标签只给读屏软件；窄屏两栏堆叠时显示标签。 */
function StepCell({ imageUrls, label, text }: StepCellProps) {
	return (
		<div className="flex min-w-0 flex-col gap-1">
			<p className="text-muted-foreground text-xs sm:sr-only">{label}</p>
			{text ? (
				<MarkdownRender imageUrls={imageUrls} text={text} />
			) : (
				<p className="text-muted-foreground">—</p>
			)}
		</div>
	);
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
		<li
			className={cn(
				STEP_GRID_CLASS,
				"items-start border-b py-3 last:border-b-0"
			)}
		>
			<span className="numeric flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs">
				{position}
			</span>
			<StepCell imageUrls={imageUrls} label="操作步骤" text={step.step} />
			<StepCell imageUrls={imageUrls} label="预期结果" text={step.expected} />
			{/* 编辑模式中这一栏放行尾操作。查看模式留出同样的宽度，切换模式时两栏不移动。 */}
			<span aria-hidden="true" className="hidden w-6 sm:block" />
			<StepScreenshotGallery
				className="sm:col-span-2 sm:col-start-2"
				ids={stepScreenshots(step)}
				imageUrls={imageUrls}
				label={`第 ${position} 步截图`}
				onRemove={onRemoveScreenshot ? removeScreenshot : undefined}
				removing={removingScreenshot}
			/>
		</li>
	);
}

/** 只读的步骤列表：编号、操作步骤、预期结果和步骤截图。列与编辑模式一致：宽屏左右两栏，窄屏上下堆叠。用在用例详情和版本历史的快照查看中。 */
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
		<div className="rounded-lg border text-sm">
			<StepGridHeader />
			<ol>
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
		</div>
	);
}
