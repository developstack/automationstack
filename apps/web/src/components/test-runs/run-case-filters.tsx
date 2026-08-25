/**
 * 执行台左栏顶部的一行三个筛选：结论 + 模块 + 指派人。
 *
 * 三者放同一个文件，因为它们改的是同一份 `RunCaseFilter`：把 `filter` 和
 * `onFilterChange` 交给这里之后，`run-case-list.tsx` 就不必再摊开三个各写一遍
 * 展开赋值的回调——那正是它当初撑到 400 行的一半原因。拆分本身是为了让
 * `run-case-list.tsx` 回到仓库 300 行的上限之内。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { useCallback } from "react";

import type {
	AssigneeFilter,
	ModuleOption,
	RunCaseFilter,
} from "@/components/test-runs/run-execution-meta";
import {
	RESULT_LABELS,
	RESULT_ORDER,
} from "@/components/test-runs/test-run-meta";

const ALL_MODULES = "all";
const ALL_RESULTS = "all";

const ASSIGNEE_OPTIONS: readonly { label: string; value: AssigneeFilter }[] = [
	{ label: "全部人", value: "all" },
	{ label: "指派给我", value: "mine" },
	{ label: "未指派", value: "unassigned" },
];

export interface RunCaseFiltersProps {
	filter: RunCaseFilter;
	moduleOptions: readonly ModuleOption[];
	onFilterChange: (filter: RunCaseFilter) => void;
}

export function RunCaseFilters({
	filter,
	moduleOptions,
	onFilterChange,
}: RunCaseFiltersProps) {
	const handleResultFilter = useCallback(
		(next: string | null) =>
			onFilterChange({
				...filter,
				result:
					next === null || next === ALL_RESULTS
						? undefined
						: (next as TestRunCaseResult),
			}),
		[filter, onFilterChange]
	);
	const handleModuleFilter = useCallback(
		(next: string | null) =>
			onFilterChange({
				...filter,
				moduleId: next === null || next === ALL_MODULES ? undefined : next,
			}),
		[filter, onFilterChange]
	);
	const handleAssigneeFilter = useCallback(
		(next: string | null) =>
			onFilterChange({
				...filter,
				assignee: (next ?? "all") as AssigneeFilter,
			}),
		[filter, onFilterChange]
	);

	return (
		<div className="flex flex-wrap gap-2 px-2">
			{/* 结论筛选排在模块之前：比模块更常用。统计条移除后（plan 012 D2），
			    这里是按结论筛选的唯一入口。 */}
			<Select
				items={[
					{ label: "全部结论", value: ALL_RESULTS },
					...RESULT_ORDER.map((result) => ({
						label: RESULT_LABELS[result],
						value: result,
					})),
				]}
				onValueChange={handleResultFilter}
				value={filter.result ?? ALL_RESULTS}
			>
				<SelectTrigger aria-label="按结论筛选" size="sm">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL_RESULTS}>全部结论</SelectItem>
					{RESULT_ORDER.map((result) => (
						<SelectItem key={result} value={result}>
							{RESULT_LABELS[result]}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				items={[
					{ label: "全部模块", value: ALL_MODULES },
					...moduleOptions.map((option) => ({
						label: option.name,
						value: option.id,
					})),
				]}
				onValueChange={handleModuleFilter}
				value={filter.moduleId ?? ALL_MODULES}
			>
				<SelectTrigger aria-label="按模块筛选" size="sm">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value={ALL_MODULES}>全部模块</SelectItem>
					{moduleOptions.map((option) => (
						<SelectItem key={option.id} value={option.id}>
							{option.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Select
				items={ASSIGNEE_OPTIONS}
				onValueChange={handleAssigneeFilter}
				value={filter.assignee}
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
		</div>
	);
}
