import type { WorkloadStats } from "@automationstack/db/repositories/project-stats-workload-core";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@automationstack/ui/components/toggle-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@automationstack/ui/components/tooltip";
import { useQuery } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { WIDE_CARD } from "@/components/overview/overview-layout";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { WorkloadCardSkeleton } from "@/components/overview/workload-card-skeleton";
import { WorkloadMemberTable } from "@/components/overview/workload-member-table";
import {
	DEFAULT_PERIOD,
	PERIOD_OPTIONS,
	periodFrom,
	WORKLOAD_RULES,
	type WorkloadPeriod,
	workloadSummary,
} from "@/components/overview/workload-meta";
import { orpc } from "@/utils/orpc";

export const WORKLOAD_CARD_TITLE = "成员工作量";

/** 标题下的合计和统计口径的提示。 */
function WorkloadDescription({
	data,
	period,
}: {
	data: WorkloadStats;
	period: WorkloadPeriod;
}) {
	return (
		<span className="flex items-center gap-1.5">
			<span className="numeric">{workloadSummary(data.members, period)}</span>
			<Tooltip>
				<TooltipTrigger
					aria-label="统计口径"
					className="rounded-sm text-muted-foreground hover:text-foreground"
				>
					<InfoIcon aria-hidden="true" className="size-3.5" />
				</TooltipTrigger>
				<TooltipContent className="flex-col items-start gap-0.5">
					{WORKLOAD_RULES.map((rule) => (
						<span key={rule}>{rule}</span>
					))}
				</TooltipContent>
			</Tooltip>
		</span>
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
	const empty = data.members.length === 0;
	return (
		<OverviewSection
			action={toggle}
			className={WIDE_CARD}
			description={
				empty ? undefined : <WorkloadDescription data={data} period={period} />
			}
			title={WORKLOAD_CARD_TITLE}
		>
			{empty ? (
				<p className="text-muted-foreground text-sm">项目中还没有成员。</p>
			) : (
				<WorkloadMemberTable members={data.members} period={period} />
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
