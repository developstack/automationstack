import type { CaseTrendPoint } from "@automationstack/db/repositories/project-stats-trend-core";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@automationstack/ui/components/chart";
import type { ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
	CHART_ANIMATION,
	TREND_MARGIN,
	TREND_X_AXIS_PROPS,
	toTrendRows,
	useChartAnimation,
} from "@/components/overview/overview-chart";
import { TREND_CHART_BOX } from "@/components/overview/overview-layout";

const CHART_CONFIG = {
	created: { color: "var(--chart-5)", label: "新增用例" },
} satisfies ChartConfig;

const AREA_FILL_OPACITY = 0.12;

/** 维护者决定导入的用例也计入新增，并在 Tooltip 中说明（调研报告第 10.1 节）。 */
function tooltipLabel(range: ReactNode): ReactNode {
	return (
		<span className="flex flex-col">
			{range}
			<span className="font-normal text-muted-foreground">包含导入的用例</span>
		</span>
	);
}

interface CaseTrendChartProps {
	points: readonly CaseTrendPoint[];
}

/** M2：12 个 7 天区间的新增用例条数。最后一个点等于上方的大数字。 */
export function CaseTrendChart({ points }: CaseTrendChartProps) {
	const animate = useChartAnimation();

	return (
		<ChartContainer
			aria-hidden="true"
			className={TREND_CHART_BOX}
			config={CHART_CONFIG}
		>
			<AreaChart
				data={toTrendRows(points)}
				margin={TREND_MARGIN}
				role="presentation"
				tabIndex={-1}
			>
				<CartesianGrid vertical={false} />
				<XAxis {...TREND_X_AXIS_PROPS} />
				<YAxis allowDecimals={false} hide />
				<ChartTooltip
					content={
						<ChartTooltipContent
							indicator="line"
							labelFormatter={tooltipLabel}
						/>
					}
					cursor={false}
				/>
				<Area
					{...CHART_ANIMATION}
					dataKey="created"
					fill="var(--color-created)"
					fillOpacity={AREA_FILL_OPACITY}
					isAnimationActive={animate}
					stroke="var(--color-created)"
					strokeWidth={2}
					type="linear"
				/>
			</AreaChart>
		</ChartContainer>
	);
}
