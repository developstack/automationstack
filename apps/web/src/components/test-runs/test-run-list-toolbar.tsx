import type { TestRunStatus } from "@automationstack/db/schema/test-runs";
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
	DEFAULT_RUN_STATUS_FILTER_LABEL,
	RUN_STATUS_LABELS,
} from "@/components/test-runs/test-run-meta";
import { TEST_RUN_STATUS_VALUES } from "@/components/test-runs/test-run-rates";
import type { TestRunsSearch } from "@/components/test-runs/test-runs-search";

const ALL_STATUS = "all";

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
		const timer = setTimeout(() => onChange(text), KEYWORD_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	}, [onChange, text]);

	const handleInput = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setText(event.target.value),
		[]
	);

	return (
		<Input
			aria-label="搜索测试任务名称"
			className="w-64"
			onChange={handleInput}
			placeholder="搜索测试任务名称"
			value={text}
		/>
	);
}

interface StatusOption {
	label: string;
	value: string;
}

const STATUS_FILTER_OPTIONS: readonly StatusOption[] = [
	{ label: DEFAULT_RUN_STATUS_FILTER_LABEL, value: ALL_STATUS },
	...TEST_RUN_STATUS_VALUES.map((value) => ({
		label: RUN_STATUS_LABELS[value],
		value,
	})),
];

interface StatusFilterProps {
	onChange: (status: TestRunStatus | undefined) => void;
	status: TestRunStatus | undefined;
}

function StatusFilter({ onChange, status }: StatusFilterProps) {
	const handleValueChange = useCallback(
		(next: string | null) =>
			onChange(
				next === null || next === ALL_STATUS
					? undefined
					: (next as TestRunStatus)
			),
		[onChange]
	);

	return (
		<Select
			items={STATUS_FILTER_OPTIONS}
			onValueChange={handleValueChange}
			value={status ?? ALL_STATUS}
		>
			<SelectTrigger aria-label="按状态筛选测试任务">
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

interface TestRunListToolbarProps {
	count: number;
	loaded: boolean;
	onKeywordChange: (keyword: string) => void;
	onStatusChange: (status: TestRunStatus | undefined) => void;
	search: TestRunsSearch;
}

export function TestRunListToolbar({
	count,
	loaded,
	onKeywordChange,
	onStatusChange,
	search,
}: TestRunListToolbarProps) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<KeywordFilter
					keyword={search.runKeyword ?? ""}
					onChange={onKeywordChange}
				/>
				<StatusFilter onChange={onStatusChange} status={search.runStatus} />
			</div>
			<span
				aria-busy={!loaded}
				className="text-muted-foreground text-xs"
				role="status"
			>
				{loaded ? `共 ${count} 个` : ""}
			</span>
		</div>
	);
}
