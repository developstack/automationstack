import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { useCallback } from "react";

import { AssigneeFilterSelect } from "@/components/test-runs/assignee-filter-select";
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

function useFilterHandlers(
	filter: RunCaseFilter,
	onFilterChange: (filter: RunCaseFilter) => void
) {
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

	return { handleAssigneeFilter, handleModuleFilter, handleResultFilter };
}

function ResultFilter({
	onValueChange,
	value,
}: {
	onValueChange: (next: string | null) => void;
	value: string;
}) {
	return (
		<Select
			items={[
				{ label: "全部结论", value: ALL_RESULTS },
				...RESULT_ORDER.map((result) => ({
					label: RESULT_LABELS[result],
					value: result,
				})),
			]}
			onValueChange={onValueChange}
			value={value}
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
	);
}

function ModuleFilter({
	moduleOptions,
	onValueChange,
	value,
}: {
	moduleOptions: readonly ModuleOption[];
	onValueChange: (next: string | null) => void;
	value: string;
}) {
	return (
		<Select
			items={[
				{ label: "全部模块", value: ALL_MODULES },
				...moduleOptions.map((option) => ({
					label: option.name,
					value: option.id,
				})),
			]}
			onValueChange={onValueChange}
			value={value}
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
	);
}

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
	const { handleAssigneeFilter, handleModuleFilter, handleResultFilter } =
		useFilterHandlers(filter, onFilterChange);

	return (
		<div className="flex flex-wrap gap-2 px-2">
			<ResultFilter
				onValueChange={handleResultFilter}
				value={filter.result ?? ALL_RESULTS}
			/>
			<ModuleFilter
				moduleOptions={moduleOptions}
				onValueChange={handleModuleFilter}
				value={filter.moduleId ?? ALL_MODULES}
			/>
			<AssigneeFilterSelect
				onValueChange={handleAssigneeFilter}
				value={filter.assignee}
			/>
		</div>
	);
}
