/**
 * 测试任务列表页顶部那一行：关键词框 + 状态下拉 + 结果计数 + 新建按钮。
 *
 * 两个筛选都写在 URL（`?runKeyword=` / `?runStatus=`）而不是组件 state：
 * 与用例列表同一条约定，刷新、后退、把链接发给同事都能复原同一份视图。
 * 所以这里一律只收值、只往上抛值，URL 由 TestRunListView 那边写。
 */
import type { TestRunStatus } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import { Input } from "@automationstack/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { PlusIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { RUN_STATUS_LABELS } from "@/components/test-runs/test-run-meta";
import { TEST_RUN_STATUS_VALUES } from "@/components/test-runs/test-run-rates";
import type { TestRunsSearch } from "@/components/test-runs/test-runs-search";

const ALL_STATUS = "all";

/**
 * 关键词落到 URL 的延迟。与用例列表页取同一个数：两页并排放着，
 * 一个 300ms 一个别的值会让人以为其中一个「卡了一下」。
 */
const KEYWORD_DEBOUNCE_MS = 300;

interface KeywordFilterProps {
	keyword: string;
	onChange: (keyword: string) => void;
}

/**
 * 输入先进本地 state 保证打字跟手，停手 300ms 后才推进 URL。
 *
 * 直接把每一次按键写进 URL 会产生一长串历史记录，「后退」变成逐字回删；
 * 而只留组件内 state 又会让刷新和分享链接丢掉搜索词——两头都要，所以镜像一份。
 */
function KeywordFilter({ keyword, onChange }: KeywordFilterProps) {
	const [text, setText] = useState(keyword);

	// URL 变了（后退 / 分享链接进来）要把输入框同步过去。
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

	// aria-label 与 placeholder 逐字一致：语音控制用户念的是屏幕上看得见的字，
	// 两者对不上就点不中这个输入框。
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
	{ label: "全部状态", value: ALL_STATUS },
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
	/** 列表数据到位没有。没到位时计数播报要留空而不是报 0。 */
	loaded: boolean;
	onCreate: () => void;
	onKeywordChange: (keyword: string) => void;
	onStatusChange: (status: TestRunStatus | undefined) => void;
	/** 整份 search 传进来，两个控件各取各的，省得调用方逐个字段解包。 */
	search: TestRunsSearch;
}

export function TestRunListToolbar({
	count,
	loaded,
	onCreate,
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
			<div className="flex items-center gap-3">
				{/*
				 * 常驻 live region：改筛选后结果数变化必须播报，否则读屏用户
				 * 不知道筛选生效没有。未知时渲染空串而不是卸载节点——
				 * 动态插入的 live region 播报不可靠。
				 */}
				<span
					aria-busy={!loaded}
					className="text-muted-foreground text-xs"
					role="status"
				>
					{loaded ? `共 ${count} 个` : ""}
				</span>
				<Button onClick={onCreate} type="button">
					<PlusIcon data-icon="inline-start" />
					新建测试任务
				</Button>
			</div>
		</div>
	);
}
