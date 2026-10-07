import { Button } from "@automationstack/ui/components/button";

import { casePageCount } from "@/components/cases/case-list-query";

interface CasePickerSummaryProps {
	hasData: boolean;
	onClear: () => void;
	page: number;
	selectedCount: number;
	total: number;
}

export function CasePickerSummary({
	hasData,
	onClear,
	page,
	selectedCount,
	total,
}: CasePickerSummaryProps) {
	return (
		<div className="flex items-center justify-between border-t pt-3">
			<p aria-live="polite" className="text-muted-foreground text-sm">
				已选{" "}
				<span className="font-medium text-foreground tabular-nums">
					{selectedCount}
				</span>{" "}
				条用例
				{hasData
					? `，当前范围共 ${total} 条（第 ${page} / ${casePageCount(total)} 页）`
					: ""}
			</p>
			<Button
				aria-disabled={selectedCount === 0}
				onClick={onClear}
				size="sm"
				type="button"
				variant="ghost"
			>
				清空选择
			</Button>
		</div>
	);
}
