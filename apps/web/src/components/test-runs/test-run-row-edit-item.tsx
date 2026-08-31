import { DropdownMenuItem } from "@automationstack/ui/components/dropdown-menu";

import { TestRunRowDisabledItem } from "@/components/test-runs/test-run-row-disabled-item";

/**
 * 行操作菜单里的「编辑」项（从 test-run-row-actions.tsx 拆出来）。
 *
 * 规则 1 的一半：已提交的测试任务不可修改。
 */
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
