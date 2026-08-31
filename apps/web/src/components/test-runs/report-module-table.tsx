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

/**
 * 按模块卡下半截的那张表（从 report-module-card.tsx 拆出来）。
 *
 * 它是完整数据，图只是它前几行的可视化——阻塞、跳过、未测三列只在这里有，
 * 理由见 report-module-card.tsx 的头注释。
 */
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
						{/*
						 * 通过率用 packages/db 的 computePassRate 现算，不在这里手写
						 * passed/(passed+failed)：报告的整体通过率就是那个函数算的，
						 * 两处口径必须是同一份代码（它是零依赖纯函数，不会把 drizzle 带进浏览器包）。
						 */}
						<TableCell className="text-right tabular-nums">
							{formatRate(computePassRate(row))}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
