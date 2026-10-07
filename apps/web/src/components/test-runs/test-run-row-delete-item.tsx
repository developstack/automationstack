import { DropdownMenuItem } from "@automationstack/ui/components/dropdown-menu";

import { TEST_RUN_LOCKED_DELETE_HINT } from "@/components/test-runs/test-run-rates";
import { TestRunRowDisabledItem } from "@/components/test-runs/test-run-row-disabled-item";

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
