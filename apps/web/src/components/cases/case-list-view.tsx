import type { CasePriority } from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useCallback } from "react";

import { CaseFilters } from "@/components/cases/case-filters";
import { CaseListOverlays } from "@/components/cases/case-list-overlays";
import { caseListInput } from "@/components/cases/case-list-query";
import { CaseListResult } from "@/components/cases/case-list-result";
import { PageHeader } from "@/components/layout/page-header";
import { PageTransition } from "@/components/layout/page-transition";
import { WORKSPACE_VIEW_LABELS } from "@/components/layout/workspace-path";
import type { WorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";
import { useWorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";
import { hasCaseFilters } from "@/components/workspace/workspace-search";
import { orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/projects/$projectId/");
const NO_PRIORITY: CasePriority[] = [];
const NO_TAGS: string[] = [];

const CREATE_HINT_ID = "case-create-hint";

interface CaseCreateActionProps {
	canCreate: boolean;
	onCreate: () => void;
}

function CaseCreateAction({ canCreate, onCreate }: CaseCreateActionProps) {
	const handleCreate = useCallback(() => {
		if (!canCreate) {
			return;
		}
		onCreate();
	}, [canCreate, onCreate]);

	return (
		<>
			{canCreate ? null : (
				<span className="text-muted-foreground text-xs" id={CREATE_HINT_ID}>
					请先在左侧选择一个模块
				</span>
			)}
			<Button
				aria-describedby={canCreate ? undefined : CREATE_HINT_ID}
				aria-disabled={!canCreate}
				onClick={handleCreate}
			>
				<PlusIcon data-icon="inline-start" />
				新建用例
			</Button>
		</>
	);
}

interface CaseListToolbarProps {
	navigation: WorkspaceNavigation;
	projectId: string;
	search: WorkspaceSearch;
	total: number | undefined;
}

function CaseListToolbar({
	navigation,
	projectId,
	search,
	total,
}: CaseListToolbarProps) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<CaseFilters
				keyword={search.kw ?? ""}
				onKeywordChange={navigation.setKeyword}
				onPriorityChange={navigation.setPriority}
				onStatusChange={navigation.setStatus}
				onTagsChange={navigation.setTags}
				priority={search.priority ?? NO_PRIORITY}
				projectId={projectId}
				status={search.status}
				tags={search.tags ?? NO_TAGS}
			/>
			<span
				aria-busy={total === undefined}
				className="text-muted-foreground text-xs"
				role="status"
			>
				{total === undefined ? "" : `共 ${total} 条`}
			</span>
		</div>
	);
}

interface CaseListViewProps {
	projectId: string;
}

export const CASE_LIST_MAIN = "flex min-h-0 flex-col gap-3 overflow-y-auto p-4";

export function CaseListView({ projectId }: CaseListViewProps) {
	const search = routeApi.useSearch();
	const navigation = useWorkspaceNavigation();
	const listQuery = useQuery(
		orpc.cases.list.queryOptions({
			input: caseListInput(projectId, search),
			placeholderData: keepPreviousData,
		})
	);

	return (
		<PageTransition className={CASE_LIST_MAIN} phase="ready">
			<PageHeader
				actions={
					<CaseCreateAction
						canCreate={search.moduleId !== undefined}
						onCreate={navigation.openCreate}
					/>
				}
				title={WORKSPACE_VIEW_LABELS.list}
			/>
			<CaseListToolbar
				navigation={navigation}
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
			) : null}
			<CaseListOverlays
				navigation={navigation}
				projectId={projectId}
				search={search}
			/>
		</PageTransition>
	);
}
