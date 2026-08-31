import { DropdownMenuItem } from "@automationstack/ui/components/dropdown-menu";

import { TEST_RUN_LOCKED_DELETE_HINT } from "@/components/test-runs/test-run-rates";
import { TestRunRowDisabledItem } from "@/components/test-runs/test-run-row-disabled-item";

/**
 * 行操作菜单里的「删除」项（从 test-run-row-actions.tsx 拆出来）。
 *
 * 规则 1 的另一半：已提交的测试任务不可删除（后端 CONFLICT）。
 * 这条理由尤其不能藏，因为用户看到它之后要么放弃，要么转去开一个重测任务——
 * 两条路都得他自己知道了才走得了。
 */
export function TestRunRowDeleteItem({
	locked,
	onOpen,
}: {
	locked: boolean;
	onOpen: () => void;
}) {
	if (locked) {
		return (
			<TestRunRowDisabledItem
				label="删除"
				reason={TEST_RUN_LOCKED_DELETE_HINT}
			/>
		);
	}
	return (
		<DropdownMenuItem onClick={onOpen} variant="destructive">
			删除
		</DropdownMenuItem>
	);
}
