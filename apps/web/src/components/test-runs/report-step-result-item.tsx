import { MediaGallery } from "@/components/media/media-gallery";
import type { ReportStepResult } from "@/components/test-runs/report-step-results";
import { RUN_STEP_COLUMN_TITLE } from "@/components/test-runs/run-panel-typography";

/** 报告中一个步骤的实际结果：步骤序号和操作文字、实际结果的文字、实际附件的缩略图条。 */
export function ReportStepResultItem({ result }: { result: ReportStepResult }) {
	const { actualResult, items, position, step } = result;
	return (
		<li aria-label={`第 ${position} 步`} className="flex flex-col gap-1.5">
			<p className={RUN_STEP_COLUMN_TITLE}>
				{`第 ${position} 步 · `}
				<span>{step}</span>
			</p>
			{actualResult === null ? null : (
				<p className="whitespace-pre-wrap text-sm">{actualResult}</p>
			)}
			<MediaGallery
				items={items}
				label={`第 ${position} 步实际附件`}
				titlePrefix={`第 ${position} 步 · 实际附件`}
			/>
		</li>
	);
}
