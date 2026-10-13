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
import { testRunListInput } from "@/components/test-runs/test-runs-search";
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

export function TestRunListView({ projectId }: { projectId: string }) {
	const search = routeApi.useSearch();
	const navigate = useNavigate({ from: "/projects/$projectId/test-runs/" });
	const [formOpen, setFormOpen] = useState(false);
	const [editingRunId, setEditingRunId] = useState<string | null>(null);

	const listQuery = useQuery(
		orpc.testRuns.list.queryOptions({
			input: testRunListInput(projectId, search),
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
			<TestRunListHeader onCreate={openCreate} />
			<TestRunListToolbar
				count={items.length}
				loaded={listQuery.data !== undefined}
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
