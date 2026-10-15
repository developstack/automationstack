import type { CasePriority } from "@automationstack/db/schema/test-cases";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@automationstack/ui/components/toggle-group";
import { cn } from "@automationstack/ui/lib/utils";
import { useCallback } from "react";

import { PRIORITY_VALUES } from "@/components/cases/case-meta";
import { StatusBadge } from "@/components/status/status-badge";

interface PriorityFilterProps {
	onChange: (priority: CasePriority[]) => void;
	priority: CasePriority[];
}

/** 没有按下的按钮用色点表示优先级，颜色与这个优先级的 StatusBadge 相同。 */
const PRIORITY_DOT_CLASSES: Record<CasePriority, string> = {
	P0: "bg-destructive",
	P1: "bg-warning",
	P2: "bg-info",
	P3: "bg-muted-foreground",
};

function PriorityDot({ className }: { className: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn("size-1.5 shrink-0 rounded-full", className)}
			data-priority-dot=""
		/>
	);
}

interface PriorityOptionProps {
	pressed: boolean;
	value: CasePriority;
}

/**
 * 按下：这个优先级的 StatusBadge，色点用文字色。
 * 没有按下：灰色文字和这个优先级颜色的色点。两种状态的形状和宽度相同，切换时按钮不变宽。
 */
function PriorityOption({ pressed, value }: PriorityOptionProps) {
	if (pressed) {
		return (
			<StatusBadge
				icon={<PriorityDot className="bg-current" />}
				kind="priority"
				value={value}
			/>
		);
	}
	return (
		<span className="numeric inline-flex h-5 items-center gap-1 rounded-md border border-transparent px-1.5 font-medium text-muted-foreground text-xs group-hover/toggle:text-foreground">
			<PriorityDot className={PRIORITY_DOT_CLASSES[value]} />
			{value}
		</span>
	);
}

/** 分段按钮，可以按下多个优先级。每个优先级使用自己的颜色，与 StatusBadge 相同。 */
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
				<ToggleGroupItem className="px-0.5" key={value} value={value}>
					<PriorityOption pressed={priority.includes(value)} value={value} />
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
