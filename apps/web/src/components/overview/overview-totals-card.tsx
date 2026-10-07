import type { CaseStatus } from "@automationstack/db/schema/test-cases";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@automationstack/ui/components/card";
import { cn } from "@automationstack/ui/lib/utils";
import { useSuspenseQuery } from "@tanstack/react-query";

import { STATUS_LABELS } from "@/components/cases/case-meta";
import { OverviewDonut } from "@/components/overview/overview-donut";
import { orpc } from "@/utils/orpc";

const STATUS_ORDER: readonly CaseStatus[] = ["active", "draft", "deprecated"];

const STATUS_SLICES: Record<CaseStatus, { color: string; swatch: string }> = {
	active: { color: "var(--result-passed)", swatch: "bg-result-passed" },
	deprecated: { color: "var(--result-skipped)", swatch: "bg-result-skipped" },
	draft: { color: "var(--result-blocked)", swatch: "bg-result-blocked" },
};

interface StatusRowProps {
	count: number;
	status: CaseStatus;
}

function StatusRow({ count, status }: StatusRowProps) {
	return (
		<div className="flex items-center justify-between gap-2 text-sm">
			<dt className="flex items-center gap-2 text-muted-foreground">
				<span
					aria-hidden="true"
					className={cn("size-2 rounded-full", STATUS_SLICES[status].swatch)}
				/>
				{STATUS_LABELS[status]}
			</dt>
			<dd className="tabular-nums">{count}</dd>
		</div>
	);
}

interface OverviewTotalsCardProps {
	projectId: string;
}

export function OverviewTotalsCard({ projectId }: OverviewTotalsCardProps) {
	const { data } = useSuspenseQuery(
		orpc.projectStats.overview.queryOptions({ input: { projectId } })
	);
	const { statusCounts, totalCases } = data;

	return (
		<Card>
			<CardHeader>
				<CardTitle>用例总数</CardTitle>
				<CardDescription>项目里的用例存量，按状态拆分</CardDescription>
			</CardHeader>
			<CardContent>
				{totalCases === 0 ? (
					<p className="text-muted-foreground text-sm">
						查过了：这个项目一条用例都还没有。先在左侧模块树里建一个模块，再往里新建用例。
					</p>
				) : (
					<>
						<OverviewDonut
							centerLabel="条用例"
							centerValue={String(totalCases)}
							slices={STATUS_ORDER.map((status) => ({
								color: STATUS_SLICES[status].color,
								key: status,
								label: STATUS_LABELS[status],
								value: statusCounts[status],
							}))}
						/>
						<p className="sr-only">{`共 ${totalCases} 条用例`}</p>
						<dl className="flex flex-col gap-1.5">
							{STATUS_ORDER.map((status) => (
								<StatusRow
									count={statusCounts[status]}
									key={status}
									status={status}
								/>
							))}
						</dl>
					</>
				)}
			</CardContent>
		</Card>
	);
}
