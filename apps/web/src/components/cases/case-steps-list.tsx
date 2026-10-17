import type { CaseStep } from "@automationstack/db/schema/test-cases";
import { cn } from "@automationstack/ui/lib/utils";

import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import { MarkdownRender } from "@/components/cases/markdown-render";
import {
	STEP_GRID_CLASS,
	StepGridHeader,
} from "@/components/cases/step-grid-header";

const DEFAULT_EMPTY_TEXT = "还没有步骤。点击「编辑」添加操作步骤和预期结果。";

interface CaseStepsListProps {
	/** 没有步骤时显示的文字。默认指引用户点击「编辑」添加 */
	emptyText?: string;
	imageUrls: MarkdownImageUrls;
	steps: readonly CaseStep[];
}

interface CaseStepItemProps {
	imageUrls: MarkdownImageUrls;
	position: number;
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

function CaseStepItem({ imageUrls, position, step }: CaseStepItemProps) {
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
		</li>
	);
}

/** 只读的步骤列表：编号、操作步骤和预期结果。列与编辑模式一致：宽屏左右两栏，窄屏上下堆叠。用在用例详情和版本历史的快照查看中。 */
export function CaseStepsList({
	emptyText = DEFAULT_EMPTY_TEXT,
	imageUrls,
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
						position={index + 1}
						step={step}
					/>
				))}
			</ol>
		</div>
	);
}
