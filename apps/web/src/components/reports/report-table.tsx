import type { SubmittedReportItem } from "@automationstack/db/repositories/test-run-report-list-repository";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { formatDateTime } from "@/components/cases/case-meta";
import { submitterLabel } from "@/components/reports/report-list-meta";
import { formatPassRate } from "@/components/test-runs/test-run-rates";

export const REPORT_COLUMNS = [
	{ label: "测试报告", width: "" },
	{ label: "提交时间", width: "w-28" },
	{ label: "提交人", width: "" },
	{ label: "用例数", width: "w-16" },
	{ label: "通过率", width: "w-20" },
	{ label: "失败", width: "w-14" },
	{ label: "阻塞", width: "w-14" },
] as const;

const NUM_CLASS = "whitespace-nowrap tabular-nums";

function ReportRow({ item }: { item: SubmittedReportItem }) {
	const { counts, run } = item;
	return (
		<TableRow>
			<TableCell>
				<Link
					className="text-left font-medium hover:underline"
					params={{ projectId: run.projectId, runId: run.id }}
					to="/projects/$projectId/reports/$runId"
				>
					{run.name}
				</Link>
			</TableCell>
			<TableCell className={cn(NUM_CLASS, "text-muted-foreground")}>
				{run.submittedAt === null ? "—" : formatDateTime(run.submittedAt)}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{submitterLabel(run.submittedBy, item.submittedByName)}
			</TableCell>
			<TableCell className={NUM_CLASS}>{counts.total}</TableCell>
			<TableCell className={NUM_CLASS}>{formatPassRate(counts)}</TableCell>
			<TableCell className={NUM_CLASS}>{counts.failed}</TableCell>
			<TableCell className={NUM_CLASS}>{counts.blocked}</TableCell>
		</TableRow>
	);
}

/** 已提交的测试报告。点击名称打开报告。 */
export function ReportTable({ items }: { items: SubmittedReportItem[] }) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					{REPORT_COLUMNS.map((column) => (
						<TableHead className={column.width} key={column.label}>
							{column.label}
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{items.map((item) => (
					<ReportRow item={item} key={item.run.id} />
				))}
			</TableBody>
		</Table>
	);
}
