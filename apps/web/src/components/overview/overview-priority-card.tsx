import type { ProjectOverviewStats } from "@automationstack/db/repositories/project-stats-repository";
import type { CasePriority } from "@automationstack/db/schema/test-cases";
import { useQuery } from "@tanstack/react-query";

import { barcodeScaleNote } from "@/components/barcode/barcode-marks";
import { BarcodeProgress } from "@/components/barcode/barcode-progress";
import { PRIORITY_VALUES } from "@/components/cases/case-meta";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import {
	NARROW_CARD,
	PRIORITY_GRID,
} from "@/components/overview/overview-layout";
import {
	formatCount,
	sharePercent,
} from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { PriorityCardSkeleton } from "@/components/overview/priority-card-skeleton";
import { StatusBadge } from "@/components/status/status-badge";
import { orpc } from "@/utils/orpc";

export const PRIORITY_CARD_TITLE = "生效用例的优先级";

/** 4 行使用同一个竖线上限，比例才能比较。 */
const PRIORITY_MAX_MARKS = 60;

interface PriorityRowProps {
	count: number;
	priority: CasePriority;
	total: number;
}

/** 一个优先级一行。优先级不用颜色：竖线用前景色，其余部分是浅灰的轨道。 */
function PriorityRow({ count, priority, total }: PriorityRowProps) {
	return (
		<>
			<dt>
				<StatusBadge kind="priority" value={priority} />
			</dt>
			<dd>
				<BarcodeProgress
					maxMarks={PRIORITY_MAX_MARKS}
					segments={[
						{ fillClassName: "bg-foreground", key: "share", value: count },
						{ fillClassName: "bg-chart-1", key: "rest", value: total - count },
					]}
					size="sm"
				/>
			</dd>
			<dd className="numeric text-right text-muted-foreground text-xs">
				{`${formatCount(count)} 条 · ${sharePercent(count, total)}%`}
			</dd>
		</>
	);
}

interface PriorityContentProps {
	data: ProjectOverviewStats;
	projectId: string;
}

function PriorityContent({ data, projectId }: PriorityContentProps) {
	const total = data.statusCounts.active;
	if (total === 0) {
		return (
			<OverviewEmpty projectId={projectId}>
				还没有生效用例。把草稿评审为生效后，这里显示生效用例各优先级的占比。
			</OverviewEmpty>
		);
	}
	return (
		<div className="flex flex-col gap-3">
			<dl className={PRIORITY_GRID}>
				{PRIORITY_VALUES.map((priority) => (
					<PriorityRow
						count={data.activePriorityCounts[priority]}
						key={priority}
						priority={priority}
						total={total}
					/>
				))}
			</dl>
			<p className="text-muted-foreground text-xs">
				{barcodeScaleNote([total], PRIORITY_MAX_MARKS)}
			</p>
		</div>
	);
}

interface OverviewPriorityCardProps {
	projectId: string;
}

/** M9 生效用例的优先级分布：每个优先级一行条形码式进度条。 */
export function OverviewPriorityCard({ projectId }: OverviewPriorityCardProps) {
	const query = useQuery(
		orpc.projectStats.overview.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={NARROW_CARD}
			query={query}
			skeleton={<PriorityCardSkeleton />}
			title={PRIORITY_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					className={NARROW_CARD}
					description="只统计生效用例。P0/P1 占比过高时需要复核优先级"
					title={PRIORITY_CARD_TITLE}
				>
					<PriorityContent data={data} projectId={projectId} />
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}
