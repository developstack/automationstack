import type {
	CaseStep,
	CaseStepScreenshotKey,
} from "@automationstack/db/schema/test-cases";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import { StepScreenshotGallery } from "@/components/cases/step-screenshot-gallery";
import { RUN_STEP_COLUMN_TITLE } from "@/components/test-runs/run-panel-typography";

interface RunStepColumnProps {
	group: CaseStepScreenshotKey;
	imageUrls: MarkdownImageUrls;
	position: number;
	step: CaseStep;
	text: string;
	title: string;
}

/** 只读的一栏：文字和这一栏的截图（操作截图或预期截图）。 */
export function RunStepColumn({
	group,
	imageUrls,
	position,
	step,
	text,
	title,
}: RunStepColumnProps) {
	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<h4 className={RUN_STEP_COLUMN_TITLE}>{title}</h4>
			{text ? (
				<MarkdownRender imageUrls={imageUrls} text={text} />
			) : (
				<p className="text-muted-foreground text-sm">—</p>
			)}
			<StepScreenshotGallery
				group={group}
				imageUrls={imageUrls}
				position={position}
				step={step}
			/>
		</div>
	);
}
