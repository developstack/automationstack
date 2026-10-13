import type { ModuleCoverageGap } from "@automationstack/db/repositories/project-stats-coverage";
import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { useCallback, useId, useState } from "react";

import {
	type CoverageGapRow,
	formatCount,
} from "@/components/overview/overview-metrics";

export const GAP_LABELS: Record<ModuleCoverageGap, string> = {
	empty: "零用例",
	"no-active": "无生效用例",
};

const GAP_CLASSES: Record<ModuleCoverageGap, string> = {
	empty: "text-destructive-soft-foreground",
	"no-active": "text-warning-soft-foreground",
};

/** 超过这个行数时先收起，用按钮展开全部。 */
export const COLLAPSED_ROW_LIMIT = 12;

interface CoverageGapListProps {
	projectId: string;
	rows: readonly CoverageGapRow[];
}

/** M8：有缺口的模块。每行是模块路径、缺口类型和用例条数，链接到用例管理中的该模块。 */
export function CoverageGapList({ projectId, rows }: CoverageGapListProps) {
	const listId = useId();
	const [expanded, setExpanded] = useState(false);
	const toggleExpanded = useCallback(() => setExpanded((value) => !value), []);
	const collapsible = rows.length > COLLAPSED_ROW_LIMIT;
	const visible =
		collapsible && !expanded ? rows.slice(0, COLLAPSED_ROW_LIMIT) : rows;

	return (
		<div className="flex flex-col gap-2">
			<ul className="flex flex-col divide-y" id={listId}>
				{visible.map((row) => (
					<li
						className="flex items-center gap-3 py-2 text-sm"
						key={row.moduleId}
					>
						<Link
							className="min-w-0 flex-1 truncate rounded-sm hover:underline"
							params={{ projectId }}
							search={{ moduleId: row.moduleId }}
							to="/projects/$projectId"
						>
							{row.path}
						</Link>
						<span className={cn("shrink-0 text-xs", GAP_CLASSES[row.gap])}>
							{GAP_LABELS[row.gap]}
						</span>
						<span className="numeric w-16 shrink-0 text-right text-muted-foreground text-xs">
							{`${formatCount(row.caseCount)} 条用例`}
						</span>
					</li>
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
					{expanded ? "收起" : `显示全部 ${rows.length} 个模块`}
				</Button>
			) : null}
		</div>
	);
}
