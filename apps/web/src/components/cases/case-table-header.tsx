import {
	TableHead,
	TableHeader,
	TableRow,
} from "@automationstack/ui/components/table";
import { cn } from "@automationstack/ui/lib/utils";

import {
	CASE_SELECT_COLUMN,
	CASE_TABLE_COLUMNS,
	CASE_TABLE_HEAD_CLASS,
} from "@/components/cases/case-table-layout";
import type { PageSelectionState } from "@/components/interaction/page-selection";
import { SelectPageCheckbox } from "@/components/interaction/select-page-checkbox";

interface CaseTableHeaderProps {
	onTogglePage: () => void;
	pageState: PageSelectionState;
}

/** 用例表格的表头。勾选列是选中或取消当前页的勾选框。 */
export function CaseTableHeader({
	onTogglePage,
	pageState,
}: CaseTableHeaderProps) {
	return (
		<TableHeader>
			<TableRow className="hover:bg-transparent">
				{CASE_TABLE_COLUMNS.map((column) => (
					<TableHead
						className={cn(CASE_TABLE_HEAD_CLASS, column.width)}
						key={column.label}
					>
						{column === CASE_SELECT_COLUMN ? (
							<SelectPageCheckbox
								label="全选本页用例"
								onToggle={onTogglePage}
								state={pageState}
							/>
						) : (
							column.label
						)}
					</TableHead>
				))}
			</TableRow>
		</TableHeader>
	);
}
