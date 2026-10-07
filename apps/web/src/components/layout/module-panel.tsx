import { SecondaryPanel } from "@automationstack/ui/components/secondary-panel";
import { Suspense } from "react";

import { ModuleTreeSkeleton } from "@/components/skeletons/module-tree-skeleton";
import { ModuleTree } from "@/components/workspace/module-tree";

interface ModulePanelProps {
	projectId: string;
	projectName: string;
}

export function ModulePanel({ projectId, projectName }: ModulePanelProps) {
	return (
		<SecondaryPanel title={projectName}>
			<Suspense fallback={<ModuleTreeSkeleton rows={4} title={false} />}>
				<ModuleTree projectId={projectId} />
			</Suspense>
		</SecondaryPanel>
	);
}
