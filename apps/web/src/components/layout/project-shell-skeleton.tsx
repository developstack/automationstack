import { SecondaryPanel } from "@automationstack/ui/components/secondary-panel";
import { SecondaryPanelProvider } from "@automationstack/ui/components/secondary-panel-context";
import { Link, useParams } from "@tanstack/react-router";

import { CaseTableSkeleton } from "@/components/cases/case-table-skeleton";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectNameSkeleton } from "@/components/layout/project-name-skeleton";
import { ProjectShellHeader } from "@/components/layout/project-shell-header";
import { ProjectSidebar } from "@/components/layout/project-sidebar";
import { readSecondaryPanelDefaultOpen } from "@/components/layout/sidebar-state";
import { useIsCaseSection } from "@/components/layout/use-case-section";
import { ModuleTreeSkeleton } from "@/components/skeletons/module-tree-skeleton";
import { ToolbarSkeleton } from "@/components/skeletons/toolbar-skeleton";

const PANEL_FALLBACK_TITLE = "项目";

function ProjectHeaderSkeleton() {
	return (
		<ProjectShellHeader>
			<div className="flex min-w-0 items-center gap-2 text-sm">
				<nav aria-label="面包屑" className="flex items-center gap-2">
					<Link
						className="text-muted-foreground hover:underline"
						to="/projects"
					>
						项目
					</Link>
					<span aria-hidden="true" className="text-muted-foreground">
						/
					</span>
				</nav>
				<ProjectNameSkeleton />
			</div>
		</ProjectShellHeader>
	);
}

function ProjectBodySkeleton() {
	return (
		<div className="grid min-h-0 grid-rows-header-body">
			<ProjectHeaderSkeleton />
			<div className="min-h-0 min-w-0 overflow-hidden">
				<div className="flex min-h-0 flex-col gap-3 p-4">
					<ToolbarSkeleton endGap="gap-2" startWrap={false} />
					<CaseTableSkeleton />
				</div>
			</div>
		</div>
	);
}

export function ProjectShellSkeleton() {
	const { projectId } = useParams({ from: "/projects/$projectId" });
	const showModulePanel = useIsCaseSection();
	return (
		<AppShell sidebar={<ProjectSidebar projectId={projectId} />}>
			<SecondaryPanelProvider defaultOpen={readSecondaryPanelDefaultOpen()}>
				{showModulePanel ? (
					<SecondaryPanel
						className="bg-card"
						header={<ProjectNameSkeleton />}
						title={PANEL_FALLBACK_TITLE}
					>
						<ModuleTreeSkeleton rows={3} title={true} />
					</SecondaryPanel>
				) : null}
				<div className="grid min-h-0 min-w-0 flex-1 grid-rows-1">
					<ProjectBodySkeleton />
				</div>
			</SecondaryPanelProvider>
		</AppShell>
	);
}
