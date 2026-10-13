import { Badge } from "@automationstack/ui/components/badge";
import { TableCell, TableRow } from "@automationstack/ui/components/table";
import { ExternalLinkIcon } from "lucide-react";

import { formatDateTime } from "@/components/cases/case-meta";
import { StatusBadge } from "@/components/status/status-badge";
import { AttachmentCell } from "@/components/test-runs/report-attachment-cell";
import { ReportCommitLink } from "@/components/test-runs/report-commit-link";
import {
	isSafeHttpUrl,
	type ReportFailedCase,
} from "@/components/test-runs/report-meta";

const NO_DEFECT_STATUS = "—";

function DefectCell({ row }: { row: ReportFailedCase }) {
	const label = row.defectKey ?? row.defectUrl;
	if (label === null) {
		return <span className="text-muted-foreground">未关联</span>;
	}
	if (!isSafeHttpUrl(row.defectUrl)) {
		return <span title={row.defectTitle ?? undefined}>{label}</span>;
	}
	return (
		<a
			className="inline-flex items-center gap-1 underline underline-offset-2"
			href={row.defectUrl ?? ""}
			rel="noopener"
			target="_blank"
			title={row.defectTitle ?? undefined}
		>
			{label}
			<ExternalLinkIcon aria-hidden="true" className="size-3.5" />
		</a>
	);
}

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

export function ReportFailedCaseRow({ row }: { row: ReportFailedCase }) {
	return (
		<TableRow>
			<TableCell className="font-medium">{row.name}</TableCell>
			<TableCell>{row.moduleName}</TableCell>
			<TableCell>
				<StatusBadge kind="priority" value={row.priority} />
			</TableCell>
			<TableCell>
				{row.executedByName ?? (
					<span className="text-muted-foreground">未记录</span>
				)}
				{row.executedAt === null ? null : (
					<span className="block text-muted-foreground text-xs">
						{formatDateTime(row.executedAt)}
					</span>
				)}
				<SourceCell row={row} />
			</TableCell>
			<TableCell className="max-w-xs whitespace-pre-wrap">
				{row.comment ?? (
					<span className="text-muted-foreground">未填写失败原因</span>
				)}
			</TableCell>
			<TableCell>
				<AttachmentCell
					attachmentCount={row.attachmentCount}
					caseName={row.name}
					runCaseId={row.runCaseId}
				/>
			</TableCell>
			<TableCell>
				<DefectCell row={row} />
			</TableCell>
			<TableCell>
				{row.defectStatus ?? (
					<span className="text-muted-foreground">{NO_DEFECT_STATUS}</span>
				)}
			</TableCell>
		</TableRow>
	);
}
