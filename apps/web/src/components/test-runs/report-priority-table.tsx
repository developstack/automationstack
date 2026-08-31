import { Badge } from "@automationstack/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";

import { PRIORITY_BADGE_VARIANTS } from "@/components/cases/case-meta";
import { formatRate } from "@/components/test-runs/rate-format";
import type { ReportPriorityStat } from "@/components/test-runs/report-meta";

/**
 * 按优先级卡下半截的那张表（从 report-priority-card.tsx 拆出来）。
 *
 * 分母为 0 的档在这里以「—」如实出现，一条都不会丢——柱图画不了它们，
 * 理由见 report-priority-card.tsx 的头注释。
 */
export function ReportPriorityTable({
	rows,
}: {
	rows: readonly ReportPriorityStat[];
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-16">优先级</TableHead>
					<TableHead className="w-16 text-right">总数</TableHead>
					<TableHead className="w-16 text-right">通过</TableHead>
					<TableHead className="w-16 text-right">失败</TableHead>
					<TableHead className="text-right">通过率</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.priority}>
						<TableCell>
							<Badge variant={PRIORITY_BADGE_VARIANTS[row.priority]}>
								{row.priority}
							</Badge>
						</TableCell>
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
							{formatRate(row.passRate)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
