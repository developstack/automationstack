/**
 * 执行台左栏顶部那一行三个筛选里的「指派人」下拉。
 *
 * 从 `run-case-filters.tsx` 拆出来（那个文件的私有辅助组件超过了一个文件 2 个的
 * 上限）。选项表跟着一起搬：只有这一个下拉用得到它。
 *
 * 定义在模块顶层，而不是写进 `RunCaseFilters` 内部：写在内部的话，父组件每次
 * 重渲染都会造出一个新的组件类型，React 认不出是同一个，会把下拉整个卸载
 * 重建——展开着的浮层会被一并关掉。
 */
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
