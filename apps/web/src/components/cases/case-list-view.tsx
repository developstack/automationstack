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
import { useWorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";
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

interface CaseListViewProps {
	projectId: string;
}

export const CASE_LIST_MAIN = "flex min-h-0 flex-col gap-4 overflow-y-auto p-4";

export function CaseListView({ projectId }: CaseListViewProps) {
	const search = routeApi.useSearch();
	const navigation = useWorkspaceNavigation();
	const listQuery = useQuery(
		orpc.cases.list.queryOptions({
			input: caseListInput(projectId, search),
			placeholderData: keepPreviousData,
		})
	);

	const canCreate = search.moduleId !== undefined;
	const filtered = hasCaseFilters(search);

	return (
		<PageTransition className={CASE_LIST_MAIN} phase="ready">
			<PageHeader
				actions={
					<CaseCreateAction
						canCreate={canCreate}
						onCreate={navigation.openCreate}
					/>
				}
				title={WORKSPACE_VIEW_LABELS.list}
			/>
			<CaseFilters
				filtered={filtered}
				keyword={search.kw ?? ""}
				onClearFilters={navigation.clearFilters}
				onKeywordChange={navigation.setKeyword}
				onPriorityChange={navigation.setPriority}
				onStatusChange={navigation.setStatus}
				onTagsChange={navigation.setTags}
				priority={search.priority ?? NO_PRIORITY}
				projectId={projectId}
				status={search.status}
				tags={search.tags ?? NO_TAGS}
			/>
			<CaseListResult
				canCreate={canCreate}
				filtered={filtered}
				navigation={navigation}
				query={listQuery}
				selectedCaseId={search.caseId}
			/>
			<CaseListOverlays
				navigation={navigation}
				projectId={projectId}
				search={search}
			/>
		</PageTransition>
	);
}
