import { DropdownMenuItem } from "@automationstack/ui/components/dropdown-menu";

import { TestRunRowDisabledItem } from "@/components/test-runs/test-run-row-disabled-item";

/**
 * 行操作菜单里的「从失败用例创建」项（从 test-run-row-actions.tsx 拆出来）。
 *
 * 规则 2：已提交的测试任务**仍可**开重测任务，所以这里只看有没有失败用例，
 * 刻意不看 locked——它是终态唯一的出口，跟着一起灰掉就没路走了。
 */
export function TestRunRowRetestItem({
	noFailed,
	onOpen,
}: {
	noFailed: boolean;
	onOpen: () => void;
}) {
	if (noFailed) {
		return (
			<TestRunRowDisabledItem label="从失败用例创建" reason="没有失败的用例" />
		);
	}
	return <DropdownMenuItem onClick={onOpen}>从失败用例创建</DropdownMenuItem>;
}
