import { Badge } from "@automationstack/ui/components/badge";

import { formatDateTime } from "@/components/cases/case-meta";
import { ReportCommitLink } from "@/components/test-runs/report-commit-link";
import type { ReportFailedCase } from "@/components/test-runs/report-meta";

function SourceCell({ row }: { row: ReportFailedCase }) {
	if (row.executedVia !== "automation") {
		return null;
	}
	const execution = row.automationExecution;
	return (
		<span className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
			<Badge variant="secondary">脚本</Badge>
			{execution === null ? (
				<span className="text-muted-foreground">执行记录已清理</span>
			) : (
				<>
					<span className="text-muted-foreground">
						{execution.branch ?? "未记录分支"}
					</span>
					<ReportCommitLink
						ciUrl={execution.ciUrl}
						commitSha={execution.commitSha}
					/>
				</>
			)}
		</span>
	);
}

/** 「执行人 / 来源」一栏：执行人、执行时间；脚本执行的用例还显示分支和 commit。 */
export function ReportExecutorCell({ row }: { row: ReportFailedCase }) {
	return (
		<>
			{row.executedByName ?? (
				<span className="text-muted-foreground">未记录</span>
			)}
			{row.executedAt === null ? null : (
				<span className="block text-muted-foreground text-xs">
					{formatDateTime(row.executedAt)}
				</span>
			)}
			<SourceCell row={row} />
		</>
	);
}
