import type { CasePriority } from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { useCallback } from "react";

import { PRIORITY_VALUES } from "@/components/cases/case-meta";

interface PriorityToggleProps {
	active: boolean;
	onToggle: (priority: CasePriority) => void;
	value: CasePriority;
}

function PriorityToggle({ active, onToggle, value }: PriorityToggleProps) {
	const handleClick = useCallback(() => onToggle(value), [onToggle, value]);
	return (
		<Button
			aria-pressed={active}
			onClick={handleClick}
			type="button"
			variant={active ? "default" : "outline"}
		>
			{value}
		</Button>
	);
}

interface PriorityFilterProps {
	onChange: (priority: CasePriority[]) => void;
	priority: CasePriority[];
}

export function PriorityFilter({ onChange, priority }: PriorityFilterProps) {
	const handleToggle = useCallback(
		(value: CasePriority) =>
			onChange(
				priority.includes(value)
					? priority.filter((item) => item !== value)
					: [...priority, value]
			),
		[onChange, priority]
	);

	return (
		<fieldset aria-label="按优先级筛选" className="flex items-center gap-1">
			{PRIORITY_VALUES.map((value) => (
				<PriorityToggle
					active={priority.includes(value)}
					key={value}
					onToggle={handleToggle}
					value={value}
				/>
			))}
		</fieldset>
	);
}
