import type { ActiveRunsStats } from "@automationstack/db/repositories/project-stats-runs-core";
import { buttonVariants } from "@automationstack/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { sharedBarcodeScale } from "@/components/barcode/barcode-marks";
import { ActiveRunRow } from "@/components/overview/active-run-row";
import { ActiveRunsSkeleton } from "@/components/overview/active-runs-skeleton";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import { FULL_CARD } from "@/components/overview/overview-layout";
import {
	activeRunsDescription,
	formatCount,
} from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { orpc } from "@/utils/orpc";

export const ACTIVE_RUNS_CARD_TITLE = "进行中的测试任务";

interface AllRunsLinkProps {
	projectId: string;
	totalCount: number;
}

function AllRunsLink({ projectId, totalCount }: AllRunsLinkProps) {
	return (
		<Link
			className={buttonVariants({ size: "sm", variant: "ghost" })}
			params={{ projectId }}
			to="/projects/$projectId/test-runs"
		>
			{`全部 ${formatCount(totalCount)} 个`}
		</Link>
	);
}

/** 各行共用一个比例：用例多的测试任务竖线更长。 */
const RUN_MAX_MARKS = 60;

interface ActiveRunListProps {
	projectId: string;
	runs: ActiveRunsStats["runs"];
}

function ActiveRunList({ projectId, runs }: ActiveRunListProps) {
	const scale = sharedBarcodeScale(
		runs.map((run) => run.caseCount),
		RUN_MAX_MARKS
	);
	return (
		<div className="flex flex-col gap-2">
			<ul className="divide-y">
				{runs.map((run) => (
					<ActiveRunRow
						key={run.id}
						maxMarks={scale.maxMarksFor(run.caseCount)}
						projectId={projectId}
						run={run}
					/>
				))}
			</ul>
			<p className="text-muted-foreground text-xs">{scale.note}</p>
		</div>
	);
}

interface OverviewActiveRunsCardProps {
	projectId: string;
}

/** M3 进行中的测试任务：每个测试任务一行，条形码式进度条按执行结果分段。 */
export function OverviewActiveRunsCard({
	projectId,
}: OverviewActiveRunsCardProps) {
	const query = useQuery(
		orpc.projectStats.activeRuns.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={FULL_CARD}
			query={query}
			skeleton={<ActiveRunsSkeleton />}
			title={ACTIVE_RUNS_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					action={
						data.totalCount === 0 ? undefined : (
							<AllRunsLink projectId={projectId} totalCount={data.totalCount} />
						)
					}
					className={FULL_CARD}
					description={
						data.totalCount === 0 ? undefined : activeRunsDescription(data)
					}
					title={ACTIVE_RUNS_CARD_TITLE}
				>
					{data.totalCount === 0 ? (
						<OverviewEmpty projectId={projectId} target="testRuns">
							没有进行中的测试任务。新建测试任务，从用例库选择要执行的用例。
						</OverviewEmpty>
					) : (
						<ActiveRunList projectId={projectId} runs={data.runs} />
					)}
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}
