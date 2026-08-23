import type {
	CasePriority,
	CaseStatus,
} from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import {
	type CaseOption,
	PRIORITY_VALUES,
	STATUS_OPTIONS,
} from "@/components/cases/case-meta";
import { CaseTagFilter } from "@/components/cases/case-tag-filter";

const KEYWORD_DEBOUNCE_MS = 300;
const ALL_STATUS = "all";

const STATUS_FILTER_OPTIONS: readonly CaseOption[] = [
	{ label: "全部状态", value: ALL_STATUS },
	...STATUS_OPTIONS,
];

interface KeywordFilterProps {
	keyword: string;
	onChange: (keyword: string) => void;
}

/**
 * Mirrors the keyword into local state so typing stays responsive, then
 * pushes it to the URL 300ms after the last keystroke.
 */
function KeywordFilter({ keyword, onChange }: KeywordFilterProps) {
	const [text, setText] = useState(keyword);

	useEffect(() => {
		setText(keyword);
	}, [keyword]);

	useEffect(() => {
		const timer = setTimeout(() => {
			onChange(text);
		}, KEYWORD_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [onChange, text]);

	const handleInput = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setText(event.target.value),
		[]
	);

	// aria-label 必须与 placeholder 一致：语音控制用户念的是屏幕上看得见的字，
	// 两者对不上就点不中这个输入框。
	return (
		<Input
			aria-label="搜索用例名称"
			className="w-64"
			onChange={handleInput}
			placeholder="搜索用例名称"
			value={text}
		/>
	);
}

interface StatusFilterProps {
	onChange: (status: CaseStatus | undefined) => void;
	status: CaseStatus | undefined;
}

function StatusFilter({ onChange, status }: StatusFilterProps) {
	const handleValueChange = useCallback(
		(next: string | null) =>
			onChange(
				next === null || next === ALL_STATUS ? undefined : (next as CaseStatus)
			),
		[onChange]
	);

	return (
		<Select
			items={STATUS_FILTER_OPTIONS}
			onValueChange={handleValueChange}
			value={status ?? ALL_STATUS}
		>
			<SelectTrigger aria-label="按状态筛选">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{STATUS_FILTER_OPTIONS.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

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

function PriorityFilter({ onChange, priority }: PriorityFilterProps) {
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

interface CaseFiltersProps {
	keyword: string;
	onKeywordChange: (keyword: string) => void;
	onPriorityChange: (priority: CasePriority[]) => void;
	onStatusChange: (status: CaseStatus | undefined) => void;
	onTagsChange: (tags: string[]) => void;
	priority: CasePriority[];
	projectId: string;
	status: CaseStatus | undefined;
	tags: string[];
}

/**
 * Keyword (debounced), status, priority and tag filters — all written to the URL.
 *
 * 控件高度约定：同一条工具栏里的所有控件走 default 档 = 36px
 * （Input h-9 / SelectTrigger data-[size=default] h-9 / Button size="default" h-9）。
 * 优先级按钮与标签筛选此前用 size="sm"（h-8），比相邻的输入框和下拉矮 4px，
 * items-center 让它们各自居中后，上下边缘就成了两条错开的线。
 * size="sm" 留给嵌在弹层、单元格里的次级按钮，不要出现在这一行。
 */
export function CaseFilters(props: CaseFiltersProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<KeywordFilter keyword={props.keyword} onChange={props.onKeywordChange} />
			<StatusFilter onChange={props.onStatusChange} status={props.status} />
			<PriorityFilter
				onChange={props.onPriorityChange}
				priority={props.priority}
			/>
			<CaseTagFilter
				onChange={props.onTagsChange}
				projectId={props.projectId}
				tags={props.tags}
			/>
		</div>
	);
}
