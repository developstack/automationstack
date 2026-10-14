import type {
	CasePriority,
	CaseStatus,
} from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import { SearchIcon, XIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { CaseStatusFilter } from "@/components/cases/case-status-filter";
import { CaseTagFilter } from "@/components/cases/case-tag-filter";
import { PriorityFilter } from "@/components/cases/priority-filter";

const KEYWORD_DEBOUNCE_MS = 300;

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
		<div className="relative w-64 max-w-full">
			<SearchIcon
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				aria-label="搜索用例名称"
				className="pl-8"
				onChange={handleInput}
				placeholder="搜索用例名称"
				type="search"
				value={text}
			/>
		</div>
	);
}

interface CaseFiltersProps {
	/** 有筛选条件时显示「清除筛选」。没有传 onClearFilters 时不显示。 */
	filtered?: boolean;
	keyword: string;
	onClearFilters?: () => void;
	onKeywordChange: (keyword: string) => void;
	onPriorityChange: (priority: CasePriority[]) => void;
	onStatusChange: (status: CaseStatus | undefined) => void;
	onTagsChange: (tags: string[]) => void;
	priority: CasePriority[];
	projectId: string;
	status: CaseStatus | undefined;
	tags: string[];
}

/** 用例列表的筛选栏：名称、状态、优先级和标签。有筛选条件时显示「清除筛选」。 */
export function CaseFilters(props: CaseFiltersProps) {
	return (
		<search aria-label="筛选用例" className="flex flex-wrap items-center gap-2">
			<KeywordFilter keyword={props.keyword} onChange={props.onKeywordChange} />
			<CaseStatusFilter onChange={props.onStatusChange} status={props.status} />
			<PriorityFilter
				onChange={props.onPriorityChange}
				priority={props.priority}
			/>
			<CaseTagFilter
				onChange={props.onTagsChange}
				projectId={props.projectId}
				tags={props.tags}
			/>
			{props.filtered === true && props.onClearFilters !== undefined ? (
				<Button
					className="fade-in-0 animate-in duration-150"
					onClick={props.onClearFilters}
					type="button"
					variant="ghost"
				>
					<XIcon data-icon="inline-start" />
					清除筛选
				</Button>
			) : null}
		</search>
	);
}
