import { SecondaryPanel } from "@automationstack/ui/components/secondary-panel";
import { Suspense } from "react";

import { ModulePanelSkeleton } from "@/components/skeletons/module-panel-skeleton";
import { ModuleTree } from "@/components/workspace/module-tree";

interface ModulePanelProps {
	projectId: string;
	projectName: string;
}

export function ModulePanel({ projectId, projectName }: ModulePanelProps) {
	return (
		<SecondaryPanel className="bg-card" title={projectName}>
			<Suspense fallback={<ModulePanelSkeleton rows={4} />}>
				<ModuleTree projectId={projectId} />
			</Suspense>
		</SecondaryPanel>
	);
}
