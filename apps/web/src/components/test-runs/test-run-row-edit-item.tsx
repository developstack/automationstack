import { DropdownMenuItem } from "@automationstack/ui/components/dropdown-menu";

import { TestRunRowDisabledItem } from "@/components/test-runs/test-run-row-disabled-item";

export function TestRunRowEditItem({
	locked,
	onEdit,
}: {
	locked: boolean;
	onEdit: () => void;
}) {
	if (locked) {
		return <TestRunRowDisabledItem label="编辑" reason="已提交后不可修改" />;
	}
	return <DropdownMenuItem onClick={onEdit}>编辑</DropdownMenuItem>;
}
