/**
 * 测试任务列表（plan §7.1）：关键词搜索 + 状态筛选 + 表格 + 新建入口。
 *
 * 两个筛选都写在 URL（`?runKeyword=` / `?runStatus=`）而不是组件 state：
 * 与用例列表同一条约定，刷新、后退、把链接发给同事都能复原同一份视图。
 */
import type { TestRunStatus } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@automationstack/ui/components/empty";
import { Input } from "@automationstack/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@automationstack/ui/components/select";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { ClipboardListIcon, PlusIcon } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useState } from "react";

import { PageTransition } from "@/components/layout/page-transition";
import { TestRunCreateSheet } from "@/components/test-runs/test-run-create-sheet";
import { TestRunEditDialog } from "@/components/test-runs/test-run-edit-dialog";
import { TestRunListSkeleton } from "@/components/test-runs/test-run-list-skeleton";
import { RUN_STATUS_LABELS } from "@/components/test-runs/test-run-meta";
import { TEST_RUN_STATUS_VALUES } from "@/components/test-runs/test-run-rates";
import { TestRunTable } from "@/components/test-runs/test-run-table";
import { testRunListInput } from "@/components/test-runs/test-runs-search";
import { orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/projects/$projectId/test-runs/");

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

/**
 * 空状态要说清「为什么空」：有筛选时问题多半出在筛选条件上，
 * 而一句笼统的「还没有测试任务」会让人以为数据没了。
 */
function TestRunEmpty({ filtered }: { filtered: boolean }) {
	return (
		<Empty>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<ClipboardListIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>
					{filtered ? "没有符合条件的测试任务" : "还没有测试任务"}
				</EmptyTitle>
				<EmptyDescription>
					{filtered
						? "换个关键词，或把状态切回「全部状态」看看。"
						: "点击右上角「新建测试任务」，挑一批用例开始这一轮测试。"}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

/** 与用例列表页同一份内容区内边距约定，见 `CASE_LIST_MAIN` 的注释。 */
export const TEST_RUN_LIST_MAIN =
	"flex min-h-0 flex-col gap-3 overflow-y-auto p-4";

export function TestRunListView({ projectId }: { projectId: string }) {
	const search = routeApi.useSearch();
	const navigate = useNavigate({ from: "/projects/$projectId/test-runs/" });
	const [formOpen, setFormOpen] = useState(false);
	const [editingRunId, setEditingRunId] = useState<string | null>(null);

	const listQuery = useQuery(
		orpc.testRuns.list.queryOptions({
			input: testRunListInput(projectId, search),
			// 改筛选/敲关键词时留住上一份结果，表格不会先塌成 0 高度再涨回来。
			placeholderData: keepPreviousData,
		})
	);

	const setStatus = useCallback(
		(status: TestRunStatus | undefined) => {
			navigate({ search: (prev) => ({ ...prev, runStatus: status }) });
		},
		[navigate]
	);

	/*
	 * replace: true —— 关键词是防抖输入，每停手一次就是一条历史记录，
	 * 不 replace 的话「后退」要按到手软才能真的离开这一页。
	 * 值没变就原样返回，不产生导航：挂载时那次防抖也会推一遍当前值，
	 * 无条件 navigate 会让深链在进入页面 300ms 后被自己覆盖一次。
	 */
	const setKeyword = useCallback(
		(keyword: string) => {
			const runKeyword = keyword === "" ? undefined : keyword;
			navigate({
				replace: true,
				search: (prev) =>
					prev.runKeyword === runKeyword ? prev : { ...prev, runKeyword },
			});
		},
		[navigate]
	);

	const openCreate = useCallback(() => {
		setEditingRunId(null);
		setFormOpen(true);
	}, []);
	const openEdit = useCallback((runId: string) => {
		setEditingRunId(runId);
		setFormOpen(true);
	}, []);
	const closeForm = useCallback(() => setFormOpen(false), []);

	const items = listQuery.data ?? [];
	/*
	 * 编辑对话框要的是那一份 `TestRun`。从已经加载的列表里取而不是再拉一次
	 * `testRuns.get`：这一份就是屏幕上刚点的那一行，多一次往返只会让对话框空着等。
	 */
	const editingRun =
		items.find((item) => item.run.id === editingRunId)?.run ?? null;

	return (
		<PageTransition className={TEST_RUN_LIST_MAIN} phase="ready">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<KeywordFilter
						keyword={search.runKeyword ?? ""}
						onChange={setKeyword}
					/>
					<StatusFilter onChange={setStatus} status={search.runStatus} />
				</div>
				<div className="flex items-center gap-3">
					{/*
					 * 常驻 live region：改筛选后结果数变化必须播报，否则读屏用户
					 * 不知道筛选生效没有。未知时渲染空串而不是卸载节点——
					 * 动态插入的 live region 播报不可靠。
					 */}
					<span
						aria-busy={listQuery.data === undefined}
						className="text-muted-foreground text-xs"
						role="status"
					>
						{listQuery.data === undefined ? "" : `共 ${items.length} 个`}
					</span>
					<Button onClick={openCreate} type="button">
						<PlusIcon data-icon="inline-start" />
						新建测试任务
					</Button>
				</div>
			</div>
			{/*
			 * 「已完成」是「都测完了」，不是「都通过了」（plan §2.4）。这句话摆在
			 * 表头上方一次，而不是每行都塞一段 sr-only 说明——后者读屏用户每扫一行
			 * 都要听一遍，反而没人听得进去。
			 */}
			<p className="text-muted-foreground text-xs">
				「已完成」表示所有用例都已给出结论，其中可能包含失败、阻塞或跳过；
				质量看「通过率」一列（分母不含阻塞与跳过，无从判断时显示「—」）。
			</p>
			{listQuery.data === undefined ? <TestRunListSkeleton /> : null}
			{listQuery.data !== undefined && items.length === 0 ? (
				<TestRunEmpty
					filtered={
						search.runStatus !== undefined || search.runKeyword !== undefined
					}
				/>
			) : null}
			{listQuery.data !== undefined && items.length > 0 ? (
				<TestRunTable items={items} onEdit={openEdit} />
			) : null}
			{/*
			 * 新建是大抽屉、编辑是窄对话框，两种壳两个组件（理由见各自的文件头）。
			 * 两个 open 由 editingRunId 分流，互斥，不会同时开着。
			 */}
			<TestRunCreateSheet
				onClose={closeForm}
				open={formOpen && editingRunId === null}
				projectId={projectId}
			/>
			<TestRunEditDialog
				onClose={closeForm}
				open={formOpen && editingRunId !== null}
				run={editingRun}
			/>
		</PageTransition>
	);
}
