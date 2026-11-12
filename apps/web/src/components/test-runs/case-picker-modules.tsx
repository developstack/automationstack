import { cn } from "@automationstack/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { LayersIcon } from "lucide-react";
import { useCallback } from "react";

import {
	MODULE_OPTION_ICON_CLASS,
	MODULE_OPTION_IDLE_CLASS,
	MODULE_OPTION_ROW_CLASS,
	MODULE_OPTION_SELECTED_CLASS,
	ModuleOptionList,
} from "@/components/cases/module-option-list";
import { ModuleTreeSkeleton } from "@/components/skeletons/module-tree-skeleton";
import { orpc } from "@/utils/orpc";

interface CasePickerModulesProps {
	onSelect: (moduleId: string | undefined) => void;
	projectId: string;
	selectedModuleId: string | undefined;
}

export function CasePickerModules({
	onSelect,
	projectId,
	selectedModuleId,
}: CasePickerModulesProps) {
	const treeQuery = useQuery(
		orpc.modules.tree.queryOptions({ input: { projectId } })
	);
	const selectAll = useCallback(() => onSelect(undefined), [onSelect]);

	if (!treeQuery.data) {
		return <ModuleTreeSkeleton label="模块树加载中" rows={4} title={false} />;
	}

	return (
		<nav aria-label="按模块筛选用例" className="flex flex-col gap-1 p-2">
			<button
				aria-current={selectedModuleId === undefined ? "true" : undefined}
				className={cn(
					MODULE_OPTION_ROW_CLASS,
					selectedModuleId === undefined
						? MODULE_OPTION_SELECTED_CLASS
						: MODULE_OPTION_IDLE_CLASS
				)}
				onClick={selectAll}
				type="button"
			>
				<LayersIcon aria-hidden="true" className={MODULE_OPTION_ICON_CLASS} />
				全部用例
			</button>
			<ModuleOptionList
				nodes={treeQuery.data}
				onSelect={onSelect}
				selectedModuleId={selectedModuleId}
			/>
		</nav>
	);
}
