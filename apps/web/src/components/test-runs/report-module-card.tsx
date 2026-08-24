import { computePassRate } from "@automationstack/db/repositories/test-run-metrics-core";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import {
	type ChartConfig,
	ChartContainer,
} from "@automationstack/ui/components/chart";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import {
	CHART_ANIMATION,
	CHART_SEAM,
	useChartAnimation,
} from "@/components/overview/overview-chart";
import { formatRate } from "@/components/test-runs/rate-format";
import {
	RESULT_CHART_COLORS,
	type ReportModuleStat,
} from "@/components/test-runs/report-meta";
import {
	RESULT_ICONS,
	RESULT_LABELS,
} from "@/components/test-runs/test-run-meta";

/**
 * 图里最多画几个模块。
 *
 * 后端已按失败数倒序返回，所以截断截掉的一定是失败最少的那些——这张图要回答的是
 * 「哪个模块最烂」，尾巴上那串 0 失败的模块只会把柱子压扁。被截掉的模块在下面的
 * 表格里一条不少，卡片描述里也会写明图里只画了前几个。
 */
const MAX_CHART_MODULES = 8;

const CHART_CONFIG: ChartConfig = {
	failed: { label: "失败" },
	passed: { label: "通过" },
} satisfies ChartConfig;

const BAR_MARGIN = { bottom: 0, left: 0, right: 0, top: 0 };
const BAR_SIZE = 10;
const BAR_RADIUS = 3;
/** 一个模块两根柱子，行高要装得下 2×BAR_SIZE 再留出组间距。 */
const ROW_HEIGHT_PX = 44;
const AXIS_WIDTH = 96;
const MAX_TICK_CHARS = 7;

/** Y 轴放不下整个模块名，超长截断；完整名字在下面的表格里。 */
function truncateModuleName(value: string): string {
	if (value.length <= MAX_TICK_CHARS) {
		return value;
	}
	return `${value.slice(0, MAX_TICK_CHARS)}…`;
}

const Y_AXIS_PROPS = {
	axisLine: false,
	dataKey: "moduleName",
	tickFormatter: truncateModuleName,
	tickLine: false,
	tickMargin: 4,
	type: "category",
	width: AXIS_WIDTH,
} as const;

/**
 * 通过 / 失败两根并排的柱子。整块 aria-hidden，读数由下面的表格给出。
 *
 * **不堆叠**：堆叠柱的总长是「通过+失败」，两个模块的柱子一样长可能是
 * 10 通过 0 失败，也可能是 0 通过 10 失败。这张图要一眼看出哪个模块失败多，
 * 那就得让「失败」自己有一根从同一条基线出发的柱子。
 */
function ModuleBars({ rows }: { rows: readonly ReportModuleStat[] }) {
	const animate = useChartAnimation();
	return (
		<ChartContainer
			aria-hidden="true"
			className="aspect-auto w-full"
			config={CHART_CONFIG}
			style={{ height: `${rows.length * ROW_HEIGHT_PX}px` }}
		>
			<BarChart
				data={[...rows]}
				layout="vertical"
				margin={BAR_MARGIN}
				role="presentation"
				tabIndex={-1}
			>
				<XAxis hide type="number" />
				<YAxis {...Y_AXIS_PROPS} />
				<Bar
					{...CHART_ANIMATION}
					barSize={BAR_SIZE}
					dataKey="passed"
					fill={RESULT_CHART_COLORS.passed.color}
					isAnimationActive={animate}
					radius={BAR_RADIUS}
					stroke={CHART_SEAM.stroke}
					strokeWidth={CHART_SEAM.strokeWidth}
				/>
				<Bar
					{...CHART_ANIMATION}
					barSize={BAR_SIZE}
					dataKey="failed"
					fill={RESULT_CHART_COLORS.failed.color}
					isAnimationActive={animate}
					radius={BAR_RADIUS}
					stroke={CHART_SEAM.stroke}
					strokeWidth={CHART_SEAM.strokeWidth}
				/>
			</BarChart>
		</ChartContainer>
	);
}

/**
 * 两根柱子各是谁。灰阶里 chart-4 与 chart-5 只差 1.45:1，光靠深浅分不出通过和失败，
 * 所以图例这枚标记用的是结论图标（对勾 / 叉），并染成与柱子相同的颜色。
 */
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

function ModuleTable({ rows }: { rows: readonly ReportModuleStat[] }) {
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

interface ReportModuleCardProps {
	className?: string;
	modules: readonly ReportModuleStat[];
}

/**
 * 按模块的通过 / 失败对比（plan §7.4 的第 2 张图）：哪个模块最差。
 *
 * 表格是完整数据，图只是它前几行的可视化——所以表格里带上了阻塞、跳过、未测
 * 三列。这三个数字画不进「通过 vs 失败」的对比图，但少了它们就没法解释
 * 一个「通过 2 失败 0」的模块为什么不值得高兴（它可能还有 40 条没测）。
 */
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
						<ModuleTable rows={modules} />
					</>
				)}
			</CardContent>
		</Card>
	);
}
