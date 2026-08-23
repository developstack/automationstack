import type {
	CasePriority,
	TestCase,
} from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

import { CaseCreateSheet } from "@/components/cases/case-create-sheet";
import { CaseDetailSheet } from "@/components/cases/case-detail-sheet";
import { CaseFilters } from "@/components/cases/case-filters";
import { caseListInput } from "@/components/cases/case-list-query";
import { CasePagination } from "@/components/cases/case-pagination";
import { CaseTable } from "@/components/cases/case-table";
import { CaseTableSkeleton } from "@/components/cases/case-table-states";
import { PageTransition } from "@/components/layout/page-transition";
import type { WorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";
import { useWorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";
import { hasCaseFilters } from "@/components/workspace/workspace-search";
import { orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/projects/$projectId/");
const NO_PRIORITY: CasePriority[] = [];
const NO_TAGS: string[] = [];

/** 「新建用例」被禁用时的原因文案 id，供 aria-describedby 关联。 */
const CREATE_HINT_ID = "case-create-hint";

interface CaseListActionsProps {
	/** 由路由注入的附加操作（如「AI 生成用例」），与「新建用例」同组排布。 */
	action: ReactNode;
	canCreate: boolean;
	onCreate: () => void;
	total: number | undefined;
}

/** 工具栏右半区：结果计数 + 附加操作 + 新建用例。 */
function CaseListActions({
	action,
	canCreate,
	onCreate,
	total,
}: CaseListActionsProps) {
	// aria-disabled 而不是原生 disabled：原生禁用会把按钮移出 tab 序，
	// 键盘和读屏用户既够不到按钮，也听不到「为什么不能用」。
	const handleCreate = useCallback(() => {
		if (!canCreate) {
			return;
		}
		onCreate();
	}, [canCreate, onCreate]);

	return (
		<div className="flex items-center gap-3">
			{/*
			 * 常驻的 live region：筛选改变结果数时必须播报，否则读屏用户
			 * 不知道筛选生效没有、还剩几条。动态插入的 live region 播报不可靠，
			 * 所以 total 未知时渲染空字符串而不是卸载整个节点。
			 */}
			<span
				aria-busy={total === undefined}
				className="text-muted-foreground text-xs"
				role="status"
			>
				{total === undefined ? "" : `共 ${total} 条`}
			</span>
			{canCreate ? null : (
				<span className="text-muted-foreground text-xs" id={CREATE_HINT_ID}>
					请先在左侧选择一个模块
				</span>
			)}
			{/* 次要操作与主操作同属一组：组内 gap-2，与左侧计数文字之间保持 gap-3 的分组间距。 */}
			<div className="flex items-center gap-2">
				{action}
				<Button
					aria-describedby={canCreate ? undefined : CREATE_HINT_ID}
					aria-disabled={!canCreate}
					onClick={handleCreate}
				>
					<PlusIcon data-icon="inline-start" />
					新建用例
				</Button>
			</div>
		</div>
	);
}

interface CaseListToolbarProps extends CaseListActionsProps {
	navigation: WorkspaceNavigation;
	projectId: string;
	search: WorkspaceSearch;
}

function CaseListToolbar(props: CaseListToolbarProps) {
	const { navigation, search } = props;
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<CaseFilters
				keyword={search.kw ?? ""}
				onKeywordChange={navigation.setKeyword}
				onPriorityChange={navigation.setPriority}
				onStatusChange={navigation.setStatus}
				onTagsChange={navigation.setTags}
				priority={search.priority ?? NO_PRIORITY}
				projectId={props.projectId}
				status={search.status}
				tags={search.tags ?? NO_TAGS}
			/>
			<CaseListActions
				action={props.action}
				canCreate={props.canCreate}
				onCreate={props.onCreate}
				total={props.total}
			/>
		</div>
	);
}

interface CaseListResultProps {
	filtered: boolean;
	navigation: WorkspaceNavigation;
	result: { items: TestCase[]; page: number; total: number };
	selectedCaseId: string | undefined;
	/** 当前展示的是上一次查询留下的结果，新数据还在路上。 */
	stale: boolean;
}

/** Table plus paginator; only rendered once the first page has loaded. */
function CaseListResult(props: CaseListResultProps) {
	const { navigation, result } = props;
	return (
		<>
			<CaseTable
				cases={result.items}
				filtered={props.filtered}
				onClearFilters={navigation.clearFilters}
				selectedCaseId={props.selectedCaseId}
				stale={props.stale}
			/>
			<CasePagination
				onPageChange={navigation.setPage}
				page={result.page}
				total={result.total}
			/>
		</>
	);
}

/** Local open/close state for the create dialog, plus post-create selection. */
function useCreateDialog(onCreated: (caseId: string) => void) {
	const [open, setOpen] = useState(false);
	const close = useCallback(() => setOpen(false), []);
	const start = useCallback(() => setOpen(true), []);
	const created = useCallback(
		(caseId: string) => {
			setOpen(false);
			onCreated(caseId);
		},
		[onCreated]
	);
	return { close, created, open, start };
}

interface CaseListOverlaysProps {
	createDialog: ReturnType<typeof useCreateDialog>;
	navigation: WorkspaceNavigation;
	projectId: string;
	search: WorkspaceSearch;
}

/** 详情抽屉与新建抽屉：都脱离文档流，不参与 main 的间距计算。 */
function CaseListOverlays(props: CaseListOverlaysProps) {
	const { createDialog, navigation, search } = props;
	return (
		<>
			<CaseDetailSheet
				caseId={search.caseId}
				historyOpen={search.history === true}
				onClose={navigation.closeCase}
				onToggleHistory={navigation.setHistory}
			/>
			<CaseCreateSheet
				moduleId={search.moduleId}
				onClose={createDialog.close}
				onCreated={createDialog.created}
				open={createDialog.open}
				projectId={props.projectId}
			/>
		</>
	);
}

interface CaseListViewProps {
	/** 工具栏右侧的附加操作；由路由提供，避免在 main 之外再套一层带内边距的容器。 */
	action: ReactNode;
	projectId: string;
}

/**
 * 内容区 <main> 的类名。
 *
 * p-4 = 内容区 gutter 16px，与 header 的 px-4、侧栏的 p-2 + px-2 落在同一条线上
 *（约定见 components/workspace/module-tree.tsx 顶部）。这里是内容区唯一的
 * 内边距来源：路由层不要再在外面套 px-*，否则会叠成 32px。
 *
 * 导出而不是就地写死：路由的 pendingComponent 要落在同一份类名上。两处各写一份
 * 迟早会各改各的，而它们之间任何一处差异都会在数据到达那一帧变成跳动。
 */
export const CASE_LIST_MAIN = "flex min-h-0 flex-col gap-3 overflow-y-auto p-4";

/**
 * Case list workspace pane: filters + table + detail sheet, all driven by the
 * URL search params so the selection survives reloads and back/forward.
 *
 * main 地标、跳转落点与路由级进场动画都由 PageTransition 给出。
 *
 * phase="ready" 在这里写死而不是当成 prop 往上提：本组件只有一个调用方，就是
 * /projects/$projectId/ 的就绪态（同路由的 pendingComponent 标的是 "pending"），
 * 多一个只会传同一个字面量的 prop 没有意义。写死也不会把动画整个关掉——"ready"
 * 只是「去问一句我是不是接在同一页的骨架后面」，缓存命中、根本没走 pending 的那种
 * 秒开导航问出来的答案是否，照常播一次进场。
 */
export function CaseListView({ action, projectId }: CaseListViewProps) {
	const search = routeApi.useSearch();
	const navigation = useWorkspaceNavigation();
	const createDialog = useCreateDialog(navigation.selectCase);
	const listQuery = useQuery(
		orpc.cases.list.queryOptions({
			input: caseListInput(projectId, search),
			placeholderData: keepPreviousData,
		})
	);

	return (
		<PageTransition className={CASE_LIST_MAIN} phase="ready">
			<CaseListToolbar
				action={action}
				canCreate={search.moduleId !== undefined}
				navigation={navigation}
				onCreate={createDialog.start}
				projectId={projectId}
				search={search}
				total={listQuery.data?.total}
			/>
			{listQuery.data ? (
				<CaseListResult
					filtered={hasCaseFilters(search)}
					navigation={navigation}
					result={listQuery.data}
					selectedCaseId={search.caseId}
					stale={listQuery.isPlaceholderData}
				/>
			) : (
				<CaseTableSkeleton />
			)}
			<CaseListOverlays
				createDialog={createDialog}
				navigation={navigation}
				projectId={projectId}
				search={search}
			/>
		</PageTransition>
	);
}
