import type {
	CasePriority,
	CaseStatus,
} from "@automationstack/db/schema/test-cases";
import { Input } from "@automationstack/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { type CaseOption, STATUS_OPTIONS } from "@/components/cases/case-meta";
import { CaseTagFilter } from "@/components/cases/case-tag-filter";
import { PriorityFilter } from "@/components/cases/priority-filter";

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
