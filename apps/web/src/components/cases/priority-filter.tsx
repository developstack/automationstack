import type { CasePriority } from "@automationstack/db/schema/test-cases";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@automationstack/ui/components/toggle-group";
import { cn } from "@automationstack/ui/lib/utils";
import { useCallback } from "react";

import { PRIORITY_VALUES } from "@/components/cases/case-meta";
import { isStrongPriority } from "@/components/status/status-badge-meta";

interface PriorityFilterProps {
	onChange: (priority: CasePriority[]) => void;
	priority: CasePriority[];
}

/** 分段按钮，可以按下多个优先级。优先级不用颜色：等宽字体，P0 加粗。 */
export function PriorityFilter({ onChange, priority }: PriorityFilterProps) {
	const handleValueChange = useCallback(
		(groupValue: string[]) =>
			onChange(PRIORITY_VALUES.filter((value) => groupValue.includes(value))),
		[onChange]
	);

	return (
		<ToggleGroup
			aria-label="按优先级筛选"
			multiple={true}
			onValueChange={handleValueChange}
			size="sm"
			value={priority}
			variant="segmented"
		>
			{PRIORITY_VALUES.map((value) => (
				<ToggleGroupItem
					className={cn(
						"numeric",
						isStrongPriority(value) ? "font-semibold" : "font-normal"
					)}
					key={value}
					value={value}
				>
					{value}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
