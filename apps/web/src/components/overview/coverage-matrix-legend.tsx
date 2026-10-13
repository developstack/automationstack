import { cn } from "@automationstack/ui/lib/utils";

import {
	ACTIVE_CELL_CLASS,
	CELL_SHAPE,
	MISSING_CELL_CLASS,
	OTHER_CELL_CLASS,
} from "@/components/overview/coverage-matrix-row";

const LEGEND_ITEMS = [
	{ cellClass: ACTIVE_CELL_CLASS, label: "生效用例" },
	{ cellClass: OTHER_CELL_CLASS, label: "草稿或废弃用例" },
	{ cellClass: MISSING_CELL_CLASS, label: "零用例" },
] as const;

export function CoverageMatrixLegend() {
	return (
		<ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
			{LEGEND_ITEMS.map((item) => (
				<li className="flex items-center gap-1.5" key={item.label}>
					<span aria-hidden="true" className={cn(CELL_SHAPE, item.cellClass)} />
					{item.label}
				</li>
			))}
		</ul>
	);
}
