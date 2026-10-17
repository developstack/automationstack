import { TableCell, TableRow } from "@automationstack/ui/components/table";

import { ReportStepResultItem } from "@/components/test-runs/report-step-result-item";
import type { ReportStepResult } from "@/components/test-runs/report-step-results";

interface ReportStepResultsRowProps {
	caseName: string;
	/** 表格的列数：这一行占满整行。 */
	columnCount: number;
	results: readonly ReportStepResult[];
}

/** 失败或阻塞用例下面的一行：有实际结果的步骤。没有这样的步骤时不显示，不留空行。 */
export function ReportStepResultsRow({
	caseName,
	columnCount,
	results,
}: ReportStepResultsRowProps) {
	if (results.length === 0) {
		return null;
	}
	return (
		<TableRow className="hover:bg-transparent">
			<TableCell className="whitespace-normal pt-0 pb-4" colSpan={columnCount}>
				<section aria-label={`「${caseName}」各步骤的实际结果`}>
					<ol className="flex flex-col gap-3 border-l pl-3">
						{results.map((result) => (
							<ReportStepResultItem key={result.id} result={result} />
						))}
					</ol>
				</section>
			</TableCell>
		</TableRow>
	);
}
