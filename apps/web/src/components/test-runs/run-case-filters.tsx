/**
 * 执行台左栏顶部的一行三个筛选：结论 + 模块 + 指派人。
 *
 * 三者放同一个文件，因为它们改的是同一份 `RunCaseFilter`：把 `filter` 和
 * `onFilterChange` 交给这里之后，`run-case-list.tsx` 就不必再摊开三个各写一遍
 * 展开赋值的回调——那正是它当初撑到 400 行的一半原因。拆分本身是为了让
 * `run-case-list.tsx` 回到仓库 300 行的上限之内。
 *
 * 文件内部再分三层，为的是让 `RunCaseFilters` 回到 eslint 的 50 行函数上限：
 * - `useFilterHandlers`：三个「换掉 filter 的某一个字段」的回调。抽成自定义
 *   hook 而不是搬进各自的下拉组件里——三个 useCallback 的调用顺序、依赖数组
 *   都原样保留在同一个位置，只是换了个地方书写；搬进子组件则会改变它们的
 *   执行时机与身份（子组件条件渲染时 hook 甚至可能不执行）。
 * - 三个 `*Filter` 组件：一个下拉的完整壳子（trigger + content）。
 * - `RunCaseFilters`：只负责把三者按顺序摆进同一行。
 *
 * 三个下拉没有合并成一个泛型组件：它们的 `SelectContent` 里「兜底项 + 列表项」
 * 的写法各不相同（结论与模块各有一条静态的「全部」项，指派人没有），硬合并要么
 * 把静态项塞进数组、要么把 content 当 children 传——后者会让 React 把原本的
 * 静态子元素当成数组元素校验 key，平白多出一条 key 警告。三份十来行的壳子
 * 重复，换掉这些是划不来的。
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

/**
 * 三个筛选回调。留在组件渲染的原位置、原顺序调用，仅仅换了书写位置。
 *
 * 依赖数组一律是 `[filter, onFilterChange]`：回调里做的是「摊开整份 filter，
 * 换掉其中一个字段」，只盯自己那个字段会拿到过期的其余字段。
 */
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

/**
 * 三个下拉都定义在模块顶层，不在 `RunCaseFilters` 内部：写在组件内部的话，
 * 父组件每次重渲染都会造出一个新的组件类型，React 认不出是同一个，会把下拉
 * 整个卸载重建——展开着的浮层会被一并关掉。
 */
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

function AssigneeFilterSelect({
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
			{/* 结论筛选排在模块之前：比模块更常用。统计条移除后（plan 012 D2），
			    这里是按结论筛选的唯一入口。 */}
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
