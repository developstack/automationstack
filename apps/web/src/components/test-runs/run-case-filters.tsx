/**
 * 执行台左栏顶部的三组筛选：结论统计条（点数字即筛选）+ 模块 + 指派人。
 *
 * 三者放同一个文件，因为它们改的是同一份 `RunCaseFilter`：把 `filter` 和
 * `onFilterChange` 交给这里之后，`run-case-list.tsx` 就不必再摊开三个各写一遍
 * 展开赋值的回调——那正是它当初撑到 400 行的一半原因。拆分本身是为了让
 * `run-case-list.tsx` 回到仓库 300 行的上限之内。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
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
	RESULT_ICONS,
	RESULT_LABELS,
	RESULT_ORDER,
	RESULT_TEXT_CLASSES,
	type ResultCounts,
} from "@/components/test-runs/test-run-meta";

const ALL_MODULES = "all";

const ASSIGNEE_OPTIONS: readonly { label: string; value: AssigneeFilter }[] = [
	{ label: "全部人", value: "all" },
	{ label: "指派给我", value: "mine" },
	{ label: "未指派", value: "unassigned" },
];

interface CountChipProps {
	active: boolean;
	count: number;
	onPick: (result: TestRunCaseResult | undefined) => void;
	result: TestRunCaseResult;
}

/**
 * 统计数字同时是筛选按钮：看到「失败 12」的第一反应就是想看那 12 条。
 * 再点一次取消筛选，所以用 `aria-pressed` 而不是 `aria-current`。
 */
function CountChip({ active, count, onPick, result }: CountChipProps) {
	const handleClick = useCallback(
		() => onPick(active ? undefined : result),
		[active, onPick, result]
	);
	const Icon = RESULT_ICONS[result];
	return (
		<Button
			aria-pressed={active}
			className="gap-1"
			onClick={handleClick}
			size="sm"
			type="button"
			variant={active ? "default" : "ghost"}
		>
			<Icon
				aria-hidden="true"
				className={active ? undefined : RESULT_TEXT_CLASSES[result]}
			/>
			{RESULT_LABELS[result]}
			<span className="tabular-nums">{count}</span>
		</Button>
	);
}

export interface RunCaseFiltersProps {
	/** 结论计数恒定按**全量**算：筛选中还能看到全局还剩多少未测。 */
	counts: ResultCounts;
	filter: RunCaseFilter;
	moduleOptions: readonly ModuleOption[];
	onFilterChange: (filter: RunCaseFilter) => void;
}

export function RunCaseFilters({
	counts,
	filter,
	moduleOptions,
	onFilterChange,
}: RunCaseFiltersProps) {
	const handleResultFilter = useCallback(
		(result: TestRunCaseResult | undefined) =>
			onFilterChange({ ...filter, result }),
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
		<>
			<div className="flex flex-wrap gap-1 p-2">
				{RESULT_ORDER.map((result) => (
					<CountChip
						active={filter.result === result}
						count={counts[result]}
						key={result}
						onPick={handleResultFilter}
						result={result}
					/>
				))}
			</div>
			<div className="flex flex-wrap gap-2 px-2">
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
		</>
	);
}
