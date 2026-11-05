import { TableCell, TableRow } from "@automationstack/ui/components/table";

import { StatusBadge } from "@/components/status/status-badge";
import { AttachmentCell } from "@/components/test-runs/report-attachment-cell";
import { ReportExecutorCell } from "@/components/test-runs/report-executor-cell";
import type { ReportFailedAndBlockedCase } from "@/components/test-runs/report-meta";
import { reportStepResults } from "@/components/test-runs/report-step-results";
import { ReportStepResultsRow } from "@/components/test-runs/report-step-results-row";
import { caseLevelAttachments } from "@/components/test-runs/run-step-attachment-items";

interface ReportFailedAndBlockedCaseRowProps {
	/** 表格的列数：步骤实际结果的一行占满整行。 */
	columnCount: number;
	row: ReportFailedAndBlockedCase;
}

/** 一条失败或阻塞的用例：用例的一行，带执行结果；下面是有实际结果的步骤（没有时不显示）。 */
export function ReportFailedAndBlockedCaseRow({
	columnCount,
	row,
}: ReportFailedAndBlockedCaseRowProps) {
	const stepResults = reportStepResults(row);
	// 整条用例的附件与执行页一致：自动化上传、以前人工上传的附件，以及已删除步骤的实际附件
	const caseAttachments = caseLevelAttachments(
		row.attachments,
		row.steps.map((step) => step.id)
	);
	return (
		<>
			<TableRow className={stepResults.length > 0 ? "border-b-0" : undefined}>
				<TableCell className="font-medium">{row.name}</TableCell>
				<TableCell>
					<StatusBadge kind="result" value={row.result} />
				</TableCell>
				<TableCell>{row.moduleName}</TableCell>
				<TableCell>
					<StatusBadge kind="priority" value={row.priority} />
				</TableCell>
				<TableCell>
					<ReportExecutorCell row={row} />
				</TableCell>
				<TableCell className="max-w-xs whitespace-pre-wrap">
					{row.comment ?? (
						<span className="text-muted-foreground">未填写说明</span>
					)}
				</TableCell>
				<TableCell>
					<AttachmentCell caseName={row.name} items={caseAttachments} />
				</TableCell>
			</TableRow>
			<ReportStepResultsRow
				caseName={row.name}
				columnCount={columnCount}
				results={stepResults}
			/>
		</>
	);
}
