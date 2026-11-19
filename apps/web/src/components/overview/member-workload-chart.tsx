import {
	type ChartConfig,
	ChartContainer,
} from "@automationstack/ui/components/chart";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";

import { workloadChartHeightPx } from "@/components/overview/chart-box";
import {
	CHART_ANIMATION,
	useChartAnimation,
} from "@/components/overview/overview-chart";

/** 一个成员的一个数。 */
export interface WorkloadBar {
	username: string;
	value: number;
}

// 工作量不是需要注意的信号，所以用浅一级的灰色
const CHART_CONFIG = {
	value: { color: "var(--chart-2)", label: "数量" },
} satisfies ChartConfig;

const BAR_SIZE = 10;
const BAR_RADIUS = 4;
const NAME_AXIS_WIDTH = 80;
const MAX_NAME_CHARS = 8;
const CHART_MARGIN = { bottom: 0, left: 0, right: 32, top: 0 };

function truncateName(value: string): string {
	return value.length <= MAX_NAME_CHARS
		? value
		: `${value.slice(0, MAX_NAME_CHARS)}…`;
}

interface MemberWorkloadChartProps {
	bars: readonly WorkloadBar[];
}

/** 成员工作量：每个成员一个横条，数字写在横条的末端。 */
export function MemberWorkloadChart({ bars }: MemberWorkloadChartProps) {
	const animate = useChartAnimation();

	return (
		<ChartContainer
			aria-hidden="true"
			className="aspect-auto w-full"
			config={CHART_CONFIG}
			style={{ height: `${workloadChartHeightPx(bars.length)}px` }}
		>
			<BarChart
				data={[...bars]}
				layout="vertical"
				margin={CHART_MARGIN}
				role="presentation"
				tabIndex={-1}
			>
				<XAxis allowDecimals={false} hide type="number" />
				<YAxis
					axisLine={false}
					dataKey="username"
					tickFormatter={truncateName}
					tickLine={false}
					type="category"
					width={NAME_AXIS_WIDTH}
				/>
				<Bar
					{...CHART_ANIMATION}
					barSize={BAR_SIZE}
					dataKey="value"
					fill="var(--color-value)"
					isAnimationActive={animate}
					minPointSize={0}
					radius={BAR_RADIUS}
				>
					<LabelList
						className="fill-muted-foreground"
						dataKey="value"
						fontSize={12}
						position="right"
					/>
				</Bar>
			</BarChart>
		</ChartContainer>
	);
}
