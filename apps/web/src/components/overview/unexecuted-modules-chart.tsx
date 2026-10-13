import type { UnexecutedModule } from "@automationstack/db/repositories/project-stats-execution-core";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@automationstack/ui/components/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import { unexecutedChartHeightPx } from "@/components/overview/chart-box";
import {
	CHART_ANIMATION,
	useChartAnimation,
} from "@/components/overview/overview-chart";

const CHART_CONFIG = {
	unexecutedCount: { color: "var(--chart-4)", label: "没有执行" },
} satisfies ChartConfig;

const BAR_SIZE = 12;
const BAR_RADIUS = 4;
const NAME_AXIS_WIDTH = 96;
const MAX_TICK_CHARS = 8;
const CHART_MARGIN = { bottom: 0, left: 0, right: 16, top: 0 };

function truncateName(value: string): string {
	return value.length <= MAX_TICK_CHARS
		? value
		: `${value.slice(0, MAX_TICK_CHARS)}…`;
}

interface UnexecutedModulesChartProps {
	modules: readonly UnexecutedModule[];
}

/** M4：每个第一层模块一个横条，长度是过去 30 天没有执行的生效用例条数。 */
export function UnexecutedModulesChart({
	modules,
}: UnexecutedModulesChartProps) {
	const animate = useChartAnimation();

	return (
		<ChartContainer
			aria-hidden="true"
			className="aspect-auto w-full"
			config={CHART_CONFIG}
			style={{ height: `${unexecutedChartHeightPx(modules.length)}px` }}
		>
			<BarChart
				data={[...modules]}
				layout="vertical"
				margin={CHART_MARGIN}
				role="presentation"
				tabIndex={-1}
			>
				<XAxis allowDecimals={false} hide type="number" />
				<YAxis
					axisLine={false}
					dataKey="name"
					tickFormatter={truncateName}
					tickLine={false}
					type="category"
					width={NAME_AXIS_WIDTH}
				/>
				<ChartTooltip content={<ChartTooltipContent />} cursor={false} />
				<Bar
					{...CHART_ANIMATION}
					barSize={BAR_SIZE}
					dataKey="unexecutedCount"
					fill="var(--color-unexecutedCount)"
					isAnimationActive={animate}
					radius={BAR_RADIUS}
				/>
			</BarChart>
		</ChartContainer>
	);
}
