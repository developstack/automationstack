import {
	EXECUTION_WINDOW_DAYS,
	UNEXECUTED_HIGH_PRIORITY_DAYS,
} from "@automationstack/db/repositories/project-stats-definitions";
import type { ExecutionCoverageStats } from "@automationstack/db/repositories/project-stats-execution";
import { useQuery } from "@tanstack/react-query";

import { unexecutedChartHeightPx } from "@/components/overview/chart-box";
import { ChartSuspense } from "@/components/overview/chart-suspense";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import { WIDE_CARD } from "@/components/overview/overview-layout";
import { LazyUnexecutedModulesChart } from "@/components/overview/overview-lazy-charts";
import { formatCount } from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { UnexecutedCardSkeleton } from "@/components/overview/unexecuted-card-skeleton";
import { UnexecutedCaseList } from "@/components/overview/unexecuted-case-list";
import { orpc } from "@/utils/orpc";

export const UNEXECUTED_CARD_TITLE = "没有执行的生效用例";

interface ModuleBarsProps {
	data: ExecutionCoverageStats;
}

function ModuleBars({ data }: ModuleBarsProps) {
	const { modules, unexecutedModuleCount } = data;
	if (modules.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				{`过去 ${EXECUTION_WINDOW_DAYS} 天，所有生效用例都执行过。`}
			</p>
		);
	}
	return (
		<>
			<ChartSuspense
				boxClassName="w-full"
				heightPx={unexecutedChartHeightPx(modules.length)}
			>
				<LazyUnexecutedModulesChart modules={modules} />
			</ChartSuspense>
			<ul className="sr-only">
				{modules.map((module) => (
					<li key={module.moduleId}>
						{`${module.name}：${formatCount(module.unexecutedCount)} 条没有执行`}
					</li>
				))}
			</ul>
			{unexecutedModuleCount > modules.length ? (
				<p className="text-muted-foreground text-xs">
					{`另有 ${formatCount(unexecutedModuleCount - modules.length)} 个第一层模块有没有执行的用例`}
				</p>
			) : null}
		</>
	);
}

interface OverviewUnexecutedCardProps {
	projectId: string;
}

/** M4 的详细部分：按第一层模块的横向条形图和过去 90 天没有执行的 P0/P1 用例。 */
export function OverviewUnexecutedCard({
	projectId,
}: OverviewUnexecutedCardProps) {
	const query = useQuery(
		orpc.projectStats.executionCoverage.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={WIDE_CARD}
			query={query}
			skeleton={<UnexecutedCardSkeleton />}
			title={UNEXECUTED_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					className={WIDE_CARD}
					description="把没有执行的用例放进下一个测试任务"
					title={UNEXECUTED_CARD_TITLE}
				>
					{data.activeCount === 0 ? (
						<OverviewEmpty projectId={projectId}>
							还没有生效用例。把草稿评审为生效后，这里列出没有执行的用例。
						</OverviewEmpty>
					) : (
						<div className="grid gap-6 md:grid-cols-2">
							<section className="flex min-w-0 flex-col gap-3">
								<h3 className="eyebrow">{`过去 ${EXECUTION_WINDOW_DAYS} 天没有执行，按第一层模块`}</h3>
								<ModuleBars data={data} />
							</section>
							<section className="flex min-w-0 flex-col gap-3">
								<h3 className="eyebrow">{`过去 ${UNEXECUTED_HIGH_PRIORITY_DAYS} 天没有执行的 P0/P1 用例`}</h3>
								<UnexecutedCaseList
									projectId={projectId}
									unexecuted={data.unexecutedHighPriority}
								/>
							</section>
						</div>
					)}
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}
