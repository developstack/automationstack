import type {
	ModuleCoverageGap,
	ModuleCoverageRow,
} from "@automationstack/db/repositories/project-stats-coverage";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import {
	formatCount,
	type MatrixCells,
	matrixCells,
} from "@/components/overview/overview-metrics";
import { CASE_STATUS_FILL_CLASSES } from "@/components/status/status-badge-meta";

const GAP_LABELS: Record<ModuleCoverageGap, string> = {
	empty: "零用例",
	"no-active": "无生效用例",
};

const GAP_CLASSES: Record<ModuleCoverageGap, string> = {
	empty: "text-destructive-soft-foreground",
	"no-active": "text-warning-soft-foreground",
};

const DEPTH_INDENTS = ["", "pl-4", "pl-8", "pl-12"] as const;

export const ACTIVE_CELL_CLASS = CASE_STATUS_FILL_CLASSES.active;

/** 方格只区分生效和其他：草稿和废弃合在一起，用废弃的填充色。 */
export const OTHER_CELL_CLASS = CASE_STATUS_FILL_CLASSES.deprecated;

/** 零用例的模块显示一个虚线方格，表示这里缺用例。 */
export const MISSING_CELL_CLASS =
	"border border-destructive-soft-foreground border-dashed";

export const CELL_SHAPE = "size-2 rounded-xs";

const CELL_ROW = "flex flex-wrap gap-0.5";

function indentOf(depth: number): string {
	return DEPTH_INDENTS[Math.min(depth, DEPTH_INDENTS.length - 1)] ?? "";
}

function cellKeys(prefix: string, count: number): string[] {
	const keys: string[] = [];
	for (let cell = 0; cell < count; cell += 1) {
		keys.push(`${prefix}-${cell}`);
	}
	return keys;
}

interface CoverageCellsProps {
	cells: MatrixCells;
	gap: ModuleCoverageGap | null;
}

/** 一个模块的方格。数量已在行内的文字中，所以方格对屏幕阅读器隐藏。 */
function CoverageCells({ cells, gap }: CoverageCellsProps) {
	const missing = gap === "empty";
	if (cells.activeCells + cells.otherCells === 0 && !missing) {
		return null;
	}
	return (
		<div aria-hidden="true" className={CELL_ROW}>
			{missing ? <span className={cn(CELL_SHAPE, MISSING_CELL_CLASS)} /> : null}
			{cellKeys("a", cells.activeCells).map((key) => (
				<span className={cn(CELL_SHAPE, ACTIVE_CELL_CLASS)} key={key} />
			))}
			{cellKeys("o", cells.otherCells).map((key) => (
				<span className={cn(CELL_SHAPE, OTHER_CELL_CLASS)} key={key} />
			))}
		</div>
	);
}

function GapLabel({ gap }: { gap: ModuleCoverageGap | null }) {
	if (gap === null) {
		return null;
	}
	return (
		<span className={cn("shrink-0 font-medium text-xs", GAP_CLASSES[gap])}>
			{GAP_LABELS[gap]}
		</span>
	);
}

export type MatrixModule = ModuleCoverageRow & { depth: number };

interface CoverageMatrixRowProps {
	module: MatrixModule;
	projectId: string;
}

/**
 * 一个模块一行。方格只画模块自己的用例，子模块的用例画在子模块的行里，所以每条用例只出现一次。
 * 缺口标记按整棵子树判定。
 */
export function CoverageMatrixRow({
	module,
	projectId,
}: CoverageMatrixRowProps) {
	const { directActiveCaseCount: active, directCaseCount: total } = module;
	const cells = matrixCells({ activeCount: active, caseCount: total });

	return (
		<li className={cn("flex flex-col gap-1.5", indentOf(module.depth))}>
			<div className="flex items-center gap-2 text-sm">
				<Link
					className="min-w-0 flex-1 truncate rounded-sm hover:underline"
					params={{ projectId }}
					search={{ moduleId: module.moduleId }}
					to="/projects/$projectId"
				>
					{module.name}
				</Link>
				<GapLabel gap={module.gap} />
				{cells.casesPerCell > 1 ? (
					<span className="numeric shrink-0 text-muted-foreground text-xs">
						{`每格 ${cells.casesPerCell} 条`}
					</span>
				) : null}
				<span
					aria-hidden="true"
					className="numeric shrink-0 text-muted-foreground text-xs"
				>
					{`${formatCount(active)}/${formatCount(total)}`}
				</span>
				<span className="sr-only">
					{`本模块 ${total} 条用例，其中 ${active} 条生效`}
				</span>
			</div>
			<CoverageCells cells={cells} gap={module.gap} />
		</li>
	);
}
