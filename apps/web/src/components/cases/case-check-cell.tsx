import type { TestCase } from "@automationstack/db/schema/test-cases";
import { Checkbox } from "@automationstack/ui/components/checkbox";
import { TableCell } from "@automationstack/ui/components/table";
import { useCallback } from "react";

import { CASE_SELECT_COLUMN } from "@/components/cases/case-table-layout";

interface CaseCheckCellProps {
	checked: boolean;
	onToggle: (caseId: string) => void;
	testCase: TestCase;
}

/** 用例表格一行的勾选框。只勾选，不打开用例详情（详情由名称链接打开）。 */
export function CaseCheckCell({
	checked,
	onToggle,
	testCase,
}: CaseCheckCellProps) {
	const toggle = useCallback(
		() => onToggle(testCase.id),
		[onToggle, testCase.id]
	);
	return (
		<TableCell className={CASE_SELECT_COLUMN.width}>
			<Checkbox
				aria-label={`选择用例「${testCase.name}」`}
				checked={checked}
				onCheckedChange={toggle}
			/>
		</TableCell>
	);
}
