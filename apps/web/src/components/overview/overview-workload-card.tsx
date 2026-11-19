import {
	EXECUTION_WINDOW_DAYS,
	RECENT_WINDOW_DAYS,
} from "@automationstack/db/repositories/project-stats-definitions";
import type {
	MemberWorkload,
	WorkloadCounts,
	WorkloadStats,
} from "@automationstack/db/repositories/project-stats-workload-core";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@automationstack/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { workloadChartHeightPx } from "@/components/overview/chart-box";
import { ChartSuspense } from "@/components/overview/chart-suspense";
import { WIDE_CARD } from "@/components/overview/overview-layout";
import { LazyMemberWorkloadChart } from "@/components/overview/overview-lazy-charts";
import { formatCount } from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { WorkloadCardSkeleton } from "@/components/overview/workload-card-skeleton";
import { orpc } from "@/utils/orpc";

export const WORKLOAD_CARD_TITLE = "成员工作量";

const WORKLOAD_DESCRIPTION =
	"执行：手动判定过的测试任务用例，同一条只算一次，不含自动化回写和已作废的测试任务。新建用例包括导入的用例。";

type WorkloadPeriod = "last7Days" | "last30Days";

const PERIOD_OPTIONS: readonly { label: string; value: WorkloadPeriod }[] = [
	{ label: `近 ${RECENT_WINDOW_DAYS} 天`, value: "last7Days" },
	{ label: `近 ${EXECUTION_WINDOW_DAYS} 天`, value: "last30Days" },
];

const DEFAULT_PERIOD: WorkloadPeriod = "last30Days";

const PANELS: readonly { key: keyof WorkloadCounts; title: string }[] = [
	{ key: "executed", title: "执行" },
	{ key: "created", title: "新建用例" },
];

/** 再次点击已按下的时间段时，分段按钮返回空列表。这时保持原来的时间段。 */
function periodFrom(
	groupValue: string[],
	current: WorkloadPeriod
): WorkloadPeriod {
	return (
		PERIOD_OPTIONS.find((option) => option.value === groupValue[0])?.value ??
		current
	);
}

interface WorkloadPanelProps {
	countKey: keyof WorkloadCounts;
	members: readonly MemberWorkload[];
	period: WorkloadPeriod;
	title: string;
}

function WorkloadPanel({
	countKey,
	members,
	period,
	title,
}: WorkloadPanelProps) {
	const bars = members.map((member) => ({
		username: member.username,
		value: member[period][countKey],
	}));
	return (
		<section className="flex min-w-0 flex-col gap-2">
			<h3 className="text-muted-foreground text-xs">{title}</h3>
			<ChartSuspense
				boxClassName="w-full"
				heightPx={workloadChartHeightPx(bars.length)}
			>
				<LazyMemberWorkloadChart bars={bars} />
			</ChartSuspense>
			<ul className="sr-only">
				{bars.map((bar) => (
					<li key={bar.username}>
						{`${bar.username}：${formatCount(bar.value)}`}
					</li>
				))}
			</ul>
		</section>
	);
}

function WorkloadSection({ data }: { data: WorkloadStats }) {
	const [period, setPeriod] = useState<WorkloadPeriod>(DEFAULT_PERIOD);
	const handleValueChange = useCallback(
		(groupValue: string[]) =>
			setPeriod((current) => periodFrom(groupValue, current)),
		[]
	);
	const toggle = (
		<ToggleGroup
			aria-label="时间段"
			onValueChange={handleValueChange}
			size="sm"
			value={[period]}
			variant="segmented"
		>
			{PERIOD_OPTIONS.map((option) => (
				<ToggleGroupItem key={option.value} value={option.value}>
					{option.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
	return (
		<OverviewSection
			action={toggle}
			className={WIDE_CARD}
			description={WORKLOAD_DESCRIPTION}
			title={WORKLOAD_CARD_TITLE}
		>
			{data.members.length === 0 ? (
				<p className="text-muted-foreground text-sm">项目中还没有成员。</p>
			) : (
				<div className="grid gap-6 md:grid-cols-2">
					{PANELS.map((panel) => (
						<WorkloadPanel
							countKey={panel.key}
							key={panel.key}
							members={data.members}
							period={period}
							title={panel.title}
						/>
					))}
				</div>
			)}
		</OverviewSection>
	);
}

interface OverviewWorkloadCardProps {
	projectId: string;
}

/** 成员工作量：每个成员执行的用例数和新建的用例数，可以切换近 7 天和近 30 天。按用户名排序。 */
export function OverviewWorkloadCard({ projectId }: OverviewWorkloadCardProps) {
	const query = useQuery(
		orpc.projectStats.memberWorkload.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={WIDE_CARD}
			query={query}
			skeleton={<WorkloadCardSkeleton />}
			title={WORKLOAD_CARD_TITLE}
		>
			{(data) => <WorkloadSection data={data} />}
		</OverviewQuery>
	);
}
