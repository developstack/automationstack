import type { ProjectCoverageStats } from "@automationstack/db/repositories/project-stats-coverage";
import { useQuery } from "@tanstack/react-query";

import { CoverageCardSkeleton } from "@/components/overview/coverage-card-skeleton";
import {
	CoverageGapList,
	GAP_LABELS,
} from "@/components/overview/coverage-gap-list";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import { WIDE_CARD } from "@/components/overview/overview-layout";
import {
	type CoverageGapRow,
	coverageGapRows,
	formatCount,
} from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { orpc } from "@/utils/orpc";

export const COVERAGE_CARD_TITLE = "模块覆盖缺口";

function coverageDescription(
	data: ProjectCoverageStats,
	rows: readonly CoverageGapRow[]
): string | undefined {
	if (data.totalModuleCount === 0) {
		return undefined;
	}
	if (rows.length === 0) {
		return `${formatCount(data.totalModuleCount)} 个模块都有生效用例`;
	}
	const emptyCount = rows.filter((row) => row.gap === "empty").length;
	const noActiveCount = rows.length - emptyCount;
	return `${GAP_LABELS.empty} ${emptyCount} 个，${GAP_LABELS["no-active"]} ${noActiveCount} 个。缺口包含子模块一起判定，父模块和子模块都有缺口时只列出父模块`;
}

interface GapCountProps {
	count: number;
}

function GapCount({ count }: GapCountProps) {
	return (
		<p className="flex items-baseline gap-1">
			<span className="numeric font-medium text-3xl tracking-tight">
				{formatCount(count)}
			</span>
			<span className="text-muted-foreground text-xs">个模块有缺口</span>
		</p>
	);
}

interface OverviewCoverageCardProps {
	projectId: string;
}

/** M8 模块覆盖缺口：标题旁是有缺口的模块数，下面是模块列表。 */
export function OverviewCoverageCard({ projectId }: OverviewCoverageCardProps) {
	const query = useQuery(
		orpc.projectStats.coverage.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={WIDE_CARD}
			query={query}
			skeleton={<CoverageCardSkeleton />}
			title={COVERAGE_CARD_TITLE}
		>
			{(data) => {
				const rows = coverageGapRows(data.modules);
				return (
					<OverviewSection
						action={
							data.totalModuleCount === 0 ? undefined : (
								<GapCount count={rows.length} />
							)
						}
						className={WIDE_CARD}
						description={coverageDescription(data, rows)}
						title={COVERAGE_CARD_TITLE}
					>
						{data.totalModuleCount === 0 ? (
							<OverviewEmpty projectId={projectId}>
								这个项目还没有模块。在用例管理的模块树里新建第一个模块。
							</OverviewEmpty>
						) : (
							<CoverageGapList projectId={projectId} rows={rows} />
						)}
					</OverviewSection>
				);
			}}
		</OverviewQuery>
	);
}
