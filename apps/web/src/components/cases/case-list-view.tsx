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
import { PageTransition } from "@/components/layout/page-transition";
import type { WorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";
import { useWorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";
import { hasCaseFilters } from "@/components/workspace/workspace-search";
import { orpc } from "@/utils/orpc";

const routeApi = getRouteApi("/projects/$projectId/");
const NO_PRIORITY: CasePriority[] = [];
const NO_TAGS: string[] = [];

const CREATE_HINT_ID = "case-create-hint";

interface CaseListActionsProps {
	canCreate: boolean;
	onCreate: () => void;
	total: number | undefined;
}

function CaseListActions({ canCreate, onCreate, total }: CaseListActionsProps) {
	const handleCreate = useCallback(() => {
		if (!canCreate) {
			return;
		}
		onCreate();
	}, [canCreate, onCreate]);

	return (
		<div className="flex items-center gap-3">
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
			<Button
				aria-describedby={canCreate ? undefined : CREATE_HINT_ID}
				aria-disabled={!canCreate}
				onClick={handleCreate}
			>
				<PlusIcon data-icon="inline-start" />
				新建用例
			</Button>
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
				canCreate={props.canCreate}
				onCreate={props.onCreate}
				total={props.total}
			/>
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
			<CaseListToolbar
				canCreate={search.moduleId !== undefined}
				navigation={navigation}
				onCreate={navigation.openCreate}
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
