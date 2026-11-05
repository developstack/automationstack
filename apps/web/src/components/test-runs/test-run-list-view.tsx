import type { TestRunListItem } from "@automationstack/db/repositories/test-runs-repository";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { PageTransition } from "@/components/layout/page-transition";
import { TestRunCreateSheet } from "@/components/test-runs/test-run-create-sheet";
import { TestRunEditDialog } from "@/components/test-runs/test-run-edit-dialog";
import { useTestRunListFilters } from "@/components/test-runs/test-run-list-controls";
import { TestRunListHeader } from "@/components/test-runs/test-run-list-header";
import { TestRunListResults } from "@/components/test-runs/test-run-list-results";
import { TestRunListToolbar } from "@/components/test-runs/test-run-list-toolbar";
import {
	type TestRunsSearch,
	testRunListInput,
} from "@/components/test-runs/test-runs-search";
import { useHasVoidedRuns } from "@/components/test-runs/use-has-voided-runs";
import { orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/projects/$projectId/test-runs/");

export const TEST_RUN_LIST_MAIN =
	"flex min-h-0 flex-col gap-3 overflow-y-auto p-4";

function TestRunListCaveat() {
	return (
		<p className="text-muted-foreground text-xs">
			「已完成」表示所有用例都已给出结论，其中可能包含失败、阻塞或跳过；
			质量看「通过率」一列（分母不含阻塞与跳过，无从判断时显示「—」）。
		</p>
	);
}

interface TestRunListFormsProps {
	editingRunId: string | null;
	items: TestRunListItem[];
	onClose: () => void;
	open: boolean;
	projectId: string;
}

function TestRunListForms({
	editingRunId,
	items,
	onClose,
	open,
	projectId,
}: TestRunListFormsProps) {
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

/**
 * 按筛选条件载入的测试任务，和项目中有没有已作废的测试任务（见 useHasVoidedRuns）。
 * 列表为空时等这两个查询都返回再显示结果，空列表的说明不会先显示「还没有测试任务」再改变。
 */
function useTestRunList(projectId: string, search: TestRunsSearch) {
	const listQuery = useQuery(
		orpc.testRuns.list.queryOptions({
			input: testRunListInput(projectId, search),
			placeholderData: keepPreviousData,
		})
	);
	const hasVoidedRuns = useHasVoidedRuns(
		projectId,
		search,
		listQuery.data?.length === 0 && !listQuery.isPlaceholderData
	);
	const loaded = listQuery.data !== undefined;
	return {
		hasVoidedRuns: hasVoidedRuns ?? false,
		items: listQuery.data ?? [],
		loaded,
		resultsLoaded: loaded && hasVoidedRuns !== undefined,
	};
}

export function TestRunListView({ projectId }: { projectId: string }) {
	const search = routeApi.useSearch();
	const navigate = useNavigate({ from: "/projects/$projectId/test-runs/" });
	const [formOpen, setFormOpen] = useState(false);
	const [editingRunId, setEditingRunId] = useState<string | null>(null);

	const { hasVoidedRuns, items, loaded, resultsLoaded } = useTestRunList(
		projectId,
		search
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

	return (
		<PageTransition className={TEST_RUN_LIST_MAIN} phase="ready">
			<TestRunListHeader onCreate={openCreate} />
			<TestRunListToolbar
				count={items.length}
				loaded={loaded}
				onKeywordChange={setKeyword}
				onStatusChange={setStatus}
				search={search}
			/>
			<TestRunListCaveat />
			<TestRunListResults
				hasVoidedRuns={hasVoidedRuns}
				items={items}
				loaded={resultsLoaded}
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
