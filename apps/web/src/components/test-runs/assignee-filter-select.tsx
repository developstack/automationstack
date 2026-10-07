import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";

import type { AssigneeFilter } from "@/components/test-runs/run-execution-meta";

const ASSIGNEE_OPTIONS: readonly { label: string; value: AssigneeFilter }[] = [
	{ label: "全部人", value: "all" },
	{ label: "指派给我", value: "mine" },
	{ label: "未指派", value: "unassigned" },
];

export function AssigneeFilterSelect({
	onValueChange,
	value,
}: {
	onValueChange: (next: string | null) => void;
	value: AssigneeFilter;
}) {
	return (
		<Select
			items={ASSIGNEE_OPTIONS}
			onValueChange={onValueChange}
			value={value}
		>
			<SelectTrigger aria-label="按指派人筛选" size="sm">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{ASSIGNEE_OPTIONS.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
