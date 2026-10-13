import type { ProjectCoverageStats } from "@automationstack/db/repositories/project-stats-coverage";
import { Button } from "@automationstack/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useId, useState } from "react";

import { CoverageCardSkeleton } from "@/components/overview/coverage-card-skeleton";
import { CoverageMatrixLegend } from "@/components/overview/coverage-matrix-legend";
import {
	CoverageMatrixRow,
	type MatrixModule,
} from "@/components/overview/coverage-matrix-row";
import { OverviewEmpty } from "@/components/overview/overview-empty";
import { COVERAGE_CARD_CLASS } from "@/components/overview/overview-layout";
import { orderModuleTree } from "@/components/overview/overview-metrics";
import { OverviewQuery } from "@/components/overview/overview-query";
import { OverviewSection } from "@/components/overview/overview-section";
import { orpc } from "@/utils/orpc";

export const COVERAGE_CARD_TITLE = "模块覆盖缺口";

export const COLLAPSED_ROW_LIMIT = 12;

interface CoverageMatrixListProps {
	modules: readonly MatrixModule[];
	projectId: string;
}

function CoverageMatrixList({ modules, projectId }: CoverageMatrixListProps) {
	const listId = useId();
	const [expanded, setExpanded] = useState(false);
	const toggleExpanded = useCallback(() => setExpanded((value) => !value), []);
	const collapsible = modules.length > COLLAPSED_ROW_LIMIT;
	const visible =
		collapsible && !expanded ? modules.slice(0, COLLAPSED_ROW_LIMIT) : modules;

	return (
		<>
			<ul className="flex flex-col gap-3" id={listId}>
				{visible.map((module) => (
					<CoverageMatrixRow
						key={module.moduleId}
						module={module}
						projectId={projectId}
					/>
				))}
			</ul>
			{collapsible ? (
				<Button
					aria-controls={listId}
					aria-expanded={expanded}
					className="self-start"
					onClick={toggleExpanded}
					size="sm"
					variant="ghost"
				>
					{expanded ? "收起" : `显示全部 ${modules.length} 个模块`}
				</Button>
			) : null}
		</>
	);
}

function coverageDescription(data: ProjectCoverageStats): string | undefined {
	if (data.totalModuleCount === 0) {
		return undefined;
	}
	const gapCount = data.emptyModuleCount + data.noActiveModuleCount;
	const gaps =
		gapCount === 0
			? `${data.totalModuleCount} 个模块都有生效用例。`
			: `${data.totalModuleCount} 个模块中 ${gapCount} 个有缺口：零用例 ${data.emptyModuleCount} 个，无生效用例 ${data.noActiveModuleCount} 个。`;
	return `${gaps}缺口包含子模块一起判定。`;
}

interface OverviewCoverageCardProps {
	projectId: string;
}

export function OverviewCoverageCard({ projectId }: OverviewCoverageCardProps) {
	const query = useQuery(
		orpc.projectStats.coverage.queryOptions({ input: { projectId } })
	);

	return (
		<OverviewQuery
			className={COVERAGE_CARD_CLASS}
			query={query}
			skeleton={<CoverageCardSkeleton />}
			title={COVERAGE_CARD_TITLE}
		>
			{(data) => (
				<OverviewSection
					className={COVERAGE_CARD_CLASS}
					description={coverageDescription(data)}
					title={COVERAGE_CARD_TITLE}
				>
					{data.totalModuleCount === 0 ? (
						<OverviewEmpty projectId={projectId}>
							这个项目还没有模块。在用例管理的模块树里新建第一个模块。
						</OverviewEmpty>
					) : (
						<>
							<CoverageMatrixLegend />
							<CoverageMatrixList
								modules={orderModuleTree(data.modules)}
								projectId={projectId}
							/>
						</>
					)}
				</OverviewSection>
			)}
		</OverviewQuery>
	);
}
