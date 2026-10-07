import { DropdownMenuItem } from "@automationstack/ui/components/dropdown-menu";

import { TestRunRowDisabledItem } from "@/components/test-runs/test-run-row-disabled-item";

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
