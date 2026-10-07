import { computePassRate } from "@automationstack/db/repositories/test-run-metrics-core";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";

import { formatRate } from "@/components/test-runs/rate-format";
import type { ReportModuleStat } from "@/components/test-runs/report-meta";

interface ReportModuleTableProps {
	rows: readonly ReportModuleStat[];
}

export function ReportModuleTable({ rows }: ReportModuleTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>模块</TableHead>
					<TableHead className="text-right">总数</TableHead>
					<TableHead className="text-right">通过</TableHead>
					<TableHead className="text-right">失败</TableHead>
					<TableHead className="text-right">阻塞</TableHead>
					<TableHead className="text-right">跳过</TableHead>
					<TableHead className="text-right">未测</TableHead>
					<TableHead className="text-right">通过率</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.moduleId}>
						<TableCell className="font-medium">{row.moduleName}</TableCell>
						<TableCell className="text-right tabular-nums">
							{row.total}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{row.passed}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{row.failed}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{row.blocked}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{row.skipped}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{row.untested}
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{formatRate(computePassRate(row))}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
