import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { lazy, Suspense } from "react";

import {
	REPORT_BARS_BOX,
	reportModuleHeightPx,
} from "@/components/overview/chart-box";
import {
	RESULT_CHART_COLORS,
	type ReportModuleStat,
} from "@/components/test-runs/report-meta";
import { ReportModuleTable } from "@/components/test-runs/report-module-table";
import {
	RESULT_ICONS,
	RESULT_LABELS,
} from "@/components/test-runs/test-run-meta";

const MAX_CHART_MODULES = 8;

const LazyReportModuleBarsChart = lazy(async () => {
	const chartModule = await import(
		"@/components/test-runs/report-module-bars-chart"
	);
	return { default: chartModule.ReportModuleBarsChart };
});

function ModuleBars({ rows }: { rows: readonly ReportModuleStat[] }) {
	const heightPx = reportModuleHeightPx(rows.length);
	return (
		<Suspense
			fallback={
				<div
					aria-hidden="true"
					className={REPORT_BARS_BOX}
					style={{ height: `${heightPx}px` }}
				/>
			}
		>
			<LazyReportModuleBarsChart heightPx={heightPx} rows={rows} />
		</Suspense>
	);
}

function ModuleLegend() {
	return (
		<p className="flex items-center gap-4 text-muted-foreground text-xs">
			{(["passed", "failed"] as const).map((result) => {
				const Icon = RESULT_ICONS[result];
				return (
					<span className="flex items-center gap-1.5" key={result}>
						<Icon
							aria-hidden="true"
							className="size-3.5"
							style={{ color: RESULT_CHART_COLORS[result].color }}
						/>
						{RESULT_LABELS[result]}
					</span>
				);
			})}
		</p>
	);
}

interface ReportModuleCardProps {
	className?: string;
	modules: readonly ReportModuleStat[];
}

export function ReportModuleCard({
	className,
	modules,
}: ReportModuleCardProps) {
	const chartRows = modules.slice(0, MAX_CHART_MODULES);
	const truncated = modules.length - chartRows.length;

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>按模块的通过与失败</CardTitle>
				<CardDescription>
					{truncated > 0
						? `按失败数从多到少排列；图中只画失败最多的 ${MAX_CHART_MODULES} 个模块，另有 ${truncated} 个见下表。`
						: "按失败数从多到少排列。"}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{modules.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						查过了：这个测试任务里的用例没有归到任何模块下。
					</p>
				) : (
					<>
						<ModuleLegend />
						<ModuleBars rows={chartRows} />
						<ReportModuleTable rows={modules} />
					</>
				)}
			</CardContent>
		</Card>
	);
}
