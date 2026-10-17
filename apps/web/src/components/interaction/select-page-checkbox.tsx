import { Checkbox } from "@automationstack/ui/components/checkbox";

import type { PageSelectionState } from "@/components/interaction/page-selection";

interface SelectPageCheckboxProps {
	label: string;
	onToggle: () => void;
	state: PageSelectionState;
}

/** 分页表格表头的勾选框：选中或取消当前页。当前页部分选中时显示半选。 */
export function SelectPageCheckbox({
	label,
	onToggle,
	state,
}: SelectPageCheckboxProps) {
	return (
		<Checkbox
			aria-label={label}
			checked={state === "all"}
			indeterminate={state === "some"}
			onCheckedChange={onToggle}
		/>
	);
}
