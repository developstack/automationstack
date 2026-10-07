import { CaseCreateSheet } from "@/components/cases/case-create-sheet";
import { CaseDetailSheet } from "@/components/cases/case-detail-sheet";
import type { WorkspaceNavigation } from "@/components/workspace/use-workspace-navigation";
import type { WorkspaceSearch } from "@/components/workspace/workspace-search";

interface CaseListOverlaysProps {
	navigation: WorkspaceNavigation;
	projectId: string;
	search: WorkspaceSearch;
}

export function CaseListOverlays(props: CaseListOverlaysProps) {
	const { navigation, search } = props;
	return (
		<>
			<CaseDetailSheet
				caseId={search.caseId}
				historyOpen={search.history === true}
				onClose={navigation.closeCase}
				onToggleHistory={navigation.setHistory}
			/>
			<CaseCreateSheet
				draftId={search.draft}
				moduleId={search.moduleId}
				onClose={navigation.closeCreate}
				onCreated={navigation.selectCase}
				open={search.create === true}
				projectId={props.projectId}
			/>
		</>
	);
}
