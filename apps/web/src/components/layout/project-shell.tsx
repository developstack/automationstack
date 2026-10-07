import { SecondaryPanelProvider } from "@automationstack/ui/components/secondary-panel-context";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { ModulePanel } from "@/components/layout/module-panel";
import { ProjectSidebar } from "@/components/layout/project-sidebar";
import { readSecondaryPanelDefaultOpen } from "@/components/layout/sidebar-state";
import { useIsCaseSection } from "@/components/layout/use-case-section";

interface ProjectShellProps {
	children: ReactNode;
	projectId: string;
	projectName: string;
}

export function ProjectShell({
	children,
	projectId,
	projectName,
}: ProjectShellProps) {
	const showModulePanel = useIsCaseSection();
	return (
		<AppShell
			sidebar={
				<ProjectSidebar projectId={projectId} projectName={projectName} />
			}
		>
			<SecondaryPanelProvider defaultOpen={readSecondaryPanelDefaultOpen()}>
				{showModulePanel ? (
					<ModulePanel projectId={projectId} projectName={projectName} />
				) : null}
				<div className="grid min-h-0 min-w-0 flex-1 grid-rows-1">
					{children}
				</div>
			</SecondaryPanelProvider>
		</AppShell>
	);
}
