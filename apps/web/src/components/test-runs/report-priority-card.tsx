import type { CasePriority } from "@automationstack/db/schema/test-cases";
import { Badge } from "@automationstack/ui/components/badge";
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
import {
	CircleCheckIcon,
	CircleHelpIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import { PRIORITY_BADGE_VARIANTS } from "@/components/cases/case-meta";
import {
	CHART_ANIMATION,
	CHART_SEAM,
	useChartAnimation,
} from "@/components/overview/overview-chart";
import { formatRate, RATE_UNKNOWN } from "@/components/test-runs/rate-format";
import type { ReportPriorityStat } from "@/components/test-runs/report-meta";

/**
 * 与 overview-priority-bars.tsx 同一套单调色阶（P0 最深 → P3 最浅）。
 * 那边刻意没导出这张表，这里照抄一份而不是把它挪成公共常量：跨页共享一个
 * 「顺手能用」的取色表，会让两页的图在其中一页改需求时被迫一起动。
 * 它是冗余编码——真正区分四根柱子的是 Y 轴上写着的 P0..P3。
 */
const PRIORITY_COLORS: Record<CasePriority, string> = {
	P0: "var(--chart-5)",
	P1: "var(--chart-4)",
	P2: "var(--chart-3)",
	P3: "var(--chart-2)",
};

const CHART_CONFIG: ChartConfig = { passRate: { label: "通过率" } };
const BAR_MARGIN = { bottom: 0, left: 0, right: 0, top: 0 };
const BAR_SIZE = 16;
const BAR_RADIUS = 4;
const ROW_HEIGHT_PX = 32;
const AXIS_WIDTH = 28;
/** 通过率是 0–1 的比值，轴域钉死，柱长直接就是通过率本身。 */
const RATE_DOMAIN = [0, 1] as const;

const Y_AXIS_PROPS = {
	axisLine: false,
	dataKey: "priority",
	tickLine: false,
	tickMargin: 4,
	type: "category",
	width: AXIS_WIDTH,
} as const;

interface PriorityBarsProps {
	/** 只含 `passRate !== null` 的档，理由见 ReportPriorityCard。 */
	rows: readonly { passRate: number; priority: CasePriority }[];
}

/**
 * 按优先级的通过率横向柱状。整块 aria-hidden，读数由下面的表格给出
 * （同 overview-priority-bars.tsx 的头注释）。
 */
function PriorityBars({ rows }: PriorityBarsProps) {
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
				<XAxis domain={[...RATE_DOMAIN]} hide type="number" />
				<YAxis {...Y_AXIS_PROPS} />
				<Bar
					{...CHART_ANIMATION}
					background={{ fill: "var(--chart-1)", radius: BAR_RADIUS }}
					barSize={BAR_SIZE}
					dataKey="passRate"
					isAnimationActive={animate}
					radius={BAR_RADIUS}
					stroke={CHART_SEAM.stroke}
					strokeWidth={CHART_SEAM.strokeWidth}
				>
					{rows.map((row) => (
						<Cell fill={PRIORITY_COLORS[row.priority]} key={row.priority} />
					))}
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}

const P0_LINE_CLASS = "flex items-start gap-2 rounded-md px-3 py-2 text-sm";

/**
 * P0 一句话结论。**这是整页最该先看到的一行**：P0 有没有失败就是上线红线。
 *
 * 三种状态必须分开说，尤其是第三种：P0 一条通过/失败结论都还没有时，
 * 既不能报「有失败」也**绝不能**报「暂无失败」——那会被读成绿灯，
 * 而此刻我们对 P0 一无所知。它和「测了都过了」是完全不同的两件事。
 */
function P0Verdict({ stat }: { stat: ReportPriorityStat | undefined }) {
	if (stat === undefined) {
		return (
			<p className={`${P0_LINE_CLASS} bg-muted text-muted-foreground`}>
				<CircleHelpIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
				这个测试任务里没有 P0 用例，无法据此判断上线红线。
			</p>
		);
	}
	if (stat.failed > 0) {
		return (
			<p className={`${P0_LINE_CLASS} bg-destructive/10 text-destructive`}>
				<TriangleAlertIcon
					aria-hidden="true"
					className="mt-0.5 size-4 shrink-0"
				/>
				{`P0 有 ${stat.failed} 条失败 —— 上线红线已触发，明细见本页底部的失败用例清单。`}
			</p>
		);
	}
	if (stat.passed === 0) {
		return (
			<p className={`${P0_LINE_CLASS} bg-muted text-muted-foreground`}>
				<CircleHelpIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
				{`P0 共 ${stat.total} 条，还没有任何「通过 / 失败」结论——红线状态未知，这不等于没问题。`}
			</p>
		);
	}
	return (
		<p className={`${P0_LINE_CLASS} bg-muted text-foreground`}>
			<CircleCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
			{`P0 共 ${stat.total} 条，已测出 ${stat.passed} 条通过、0 条失败；另有 ${stat.total - stat.passed} 条尚无「通过 / 失败」结论。`}
		</p>
	);
}

function PriorityTable({ rows }: { rows: readonly ReportPriorityStat[] }) {
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

interface ReportPriorityCardProps {
	className?: string;
	priorities: readonly ReportPriorityStat[];
}

/**
 * 按优先级的通过率（plan §7.4 的第 3 张图，也是最该显眼的一张）。
 *
 * 排在三张图的第一位、占最宽的一格：这一页别的数字都是「进度怎么样」，
 * 只有这一张回答「能不能上线」。
 *
 * 柱图只画 `passRate !== null` 的档。分母为 0 的档若照画，会得到一根长度为 0 的柱子，
 * 视觉上和「通过率 0%」一模一样——而它的含义恰恰是「无从判断」。
 * 那些档在下面的表格里以「—」如实出现，一条都不会丢。
 */
export function ReportPriorityCard({
	className,
	priorities,
}: ReportPriorityCardProps) {
	const p0 = priorities.find((row) => row.priority === "P0");
	const chartRows = priorities
		.filter((row) => row.passRate !== null)
		.map((row) => ({ passRate: row.passRate ?? 0, priority: row.priority }));

	return (
		<Card className={className}>
			<CardHeader>
				<CardTitle>按优先级的通过率</CardTitle>
				<CardDescription>
					{`分母只算「通过 + 失败」，阻塞与跳过不计入；${RATE_UNKNOWN} 表示该档还没有可判断的结论。`}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<P0Verdict stat={p0} />
				{priorities.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						查过了：这个测试任务里一条用例都没有。
					</p>
				) : (
					<>
						{chartRows.length > 0 ? <PriorityBars rows={chartRows} /> : null}
						<PriorityTable rows={priorities} />
					</>
				)}
			</CardContent>
		</Card>
	);
}
