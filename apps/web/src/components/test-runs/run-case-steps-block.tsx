import type { MarkdownImageUrls } from "@/components/cases/markdown-inline-render";
import type { RunCaseDetail } from "@/components/test-runs/run-execution-meta";
import { RunStepsSection } from "@/components/test-runs/run-steps-section";
import type { VerdictEditingMode } from "@/components/test-runs/run-verdict-editing-mode";

export interface RunCaseStepsBlockProps {
	editingMode: VerdictEditingMode;
	hasSteps: boolean;
	imageUrls: MarkdownImageUrls;
	item: RunCaseDetail;
}

export function RunCaseStepsBlock({
	editingMode,
	hasSteps,
	imageUrls,
	item,
}: RunCaseStepsBlockProps) {
	if (!hasSteps) {
		return <p className="text-muted-foreground text-sm">该用例没有步骤。</p>;
	}
	return (
		<RunStepsSection
			editingMode={editingMode}
			imageUrls={imageUrls}
			item={item}
			key={`${item.runCase.id}:${item.testCase.currentVersion}`}
		/>
	);
}
