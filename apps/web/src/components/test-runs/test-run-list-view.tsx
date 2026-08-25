/**
 * 测试任务列表（plan §7.1）：关键词搜索 + 状态筛选 + 表格 + 新建入口。
 *
 * 两个筛选都写在 URL（`?runKeyword=` / `?runStatus=`）而不是组件 state：
 * 与用例列表同一条约定，刷新、后退、把链接发给同事都能复原同一份视图。
 *
 * 这一层只剩「取数 + 把状态分给三块」：工具栏在 test-run-list-toolbar.tsx，
 * 正文三态在 test-run-list-results.tsx，两个写 URL 的回调在
 * test-run-list-controls.ts。拆开的直接原因是 eslint 的 50 行 / 复杂度 10
 * 两条上限，但分界是按「谁需要知道 listQuery」划的，不是按行数硬切。
 */
import type { TestRunListItem } from "@automationstack/db/repositories/test-runs-repository";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { PageTransition } from "@/components/layout/page-transition";
import { TestRunCreateSheet } from "@/components/test-runs/test-run-create-sheet";
import { TestRunEditDialog } from "@/components/test-runs/test-run-edit-dialog";
import { useTestRunListFilters } from "@/components/test-runs/test-run-list-controls";
import { TestRunListResults } from "@/components/test-runs/test-run-list-results";
import { TestRunListToolbar } from "@/components/test-runs/test-run-list-toolbar";
import { testRunListInput } from "@/components/test-runs/test-runs-search";
import { orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/projects/$projectId/test-runs/");

/** 与用例列表页同一份内容区内边距约定，见 `CASE_LIST_MAIN` 的注释。 */
export const TEST_RUN_LIST_MAIN =
	"flex min-h-0 flex-col gap-3 overflow-y-auto p-4";

/**
 * 「已完成」是「都测完了」，不是「都通过了」（plan §2.4）。这句话摆在
 * 表头上方一次，而不是每行都塞一段 sr-only 说明——后者读屏用户每扫一行
 * 都要听一遍，反而没人听得进去。
 */
function TestRunListCaveat() {
	return (
		<p className="text-muted-foreground text-xs">
			「已完成」表示所有用例都已给出结论，其中可能包含失败、阻塞或跳过；
			质量看「通过率」一列（分母不含阻塞与跳过，无从判断时显示「—」）。
		</p>
	);
}

interface TestRunListFormsProps {
	/** 非 null = 开编辑；null = 开新建。两个抽屉靠它分流。 */
	editingRunId: string | null;
	items: TestRunListItem[];
	onClose: () => void;
	open: boolean;
	projectId: string;
}

/**
 * 新建是大抽屉、编辑是窄对话框，两种壳两个组件（理由见各自的文件头）。
 * 两个 open 由 editingRunId 分流，互斥，不会同时开着。
 */
function TestRunListForms({
	editingRunId,
	items,
	onClose,
	open,
	projectId,
}: TestRunListFormsProps) {
	/*
	 * 编辑对话框要的是那一份 `TestRun`。从已经加载的列表里取而不是再拉一次
	 * `testRuns.get`：这一份就是屏幕上刚点的那一行，多一次往返只会让对话框空着等。
	 */
	const editingRun =
		items.find((item) => item.run.id === editingRunId)?.run ?? null;

	return (
		<>
			<TestRunCreateSheet
				onClose={onClose}
				open={open && editingRunId === null}
				projectId={projectId}
			/>
			<TestRunEditDialog
				onClose={onClose}
				open={open && editingRunId !== null}
				run={editingRun}
			/>
		</>
	);
}

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

	const { setKeyword, setStatus } = useTestRunListFilters(navigate);

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

	return (
		<PageTransition className={TEST_RUN_LIST_MAIN} phase="ready">
			<TestRunListToolbar
				count={items.length}
				loaded={listQuery.data !== undefined}
				onCreate={openCreate}
				onKeywordChange={setKeyword}
				onStatusChange={setStatus}
				search={search}
			/>
			<TestRunListCaveat />
			<TestRunListResults
				items={items}
				loaded={listQuery.data !== undefined}
				onEdit={openEdit}
				search={search}
			/>
			<TestRunListForms
				editingRunId={editingRunId}
				items={items}
				onClose={closeForm}
				open={formOpen}
				projectId={projectId}
			/>
		</PageTransition>
	);
}
