import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { cn } from "@automationstack/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FolderIcon, LayersIcon } from "lucide-react";
import { useCallback } from "react";

import { ModuleTreeSkeleton } from "@/components/skeletons/module-tree-skeleton";
import { orpc } from "@/utils/orpc";

const ROW_CLASS =
	"relative flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-left text-sm before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-foreground";
const ROW_SELECTED_CLASS = "bg-accent before:opacity-100";
const ROW_IDLE_CLASS = "before:opacity-0 hover:bg-accent/50";

const ICON_CLASS =
	"icon-stroke-regular size-3.5 shrink-0 text-muted-foreground";

interface ModuleOptionProps {
	node: ModuleTreeNode;
	onSelect: (moduleId: string | undefined) => void;
	selectedModuleId: string | undefined;
}

function ModuleOption({ node, onSelect, selectedModuleId }: ModuleOptionProps) {
	const handleSelect = useCallback(
		() => onSelect(node.id),
		[node.id, onSelect]
	);
	const selected = selectedModuleId === node.id;

	return (
		<li>
			<button
				aria-current={selected ? "true" : undefined}
				className={cn(
					ROW_CLASS,
					selected ? ROW_SELECTED_CLASS : ROW_IDLE_CLASS
				)}
				onClick={handleSelect}
				type="button"
			>
				<FolderIcon aria-hidden="true" className={ICON_CLASS} />
				<span className="truncate">{node.name}</span>
			</button>
			{node.children.length > 0 ? (
				<ul className="ps-3">
					{node.children.map((child) => (
						<ModuleOption
							key={child.id}
							node={child}
							onSelect={onSelect}
							selectedModuleId={selectedModuleId}
						/>
					))}
				</ul>
			) : null}
		</li>
	);
}

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
					ROW_CLASS,
					selectedModuleId === undefined ? ROW_SELECTED_CLASS : ROW_IDLE_CLASS
				)}
				onClick={selectAll}
				type="button"
			>
				<LayersIcon aria-hidden="true" className={ICON_CLASS} />
				全部用例
			</button>
			<ul>
				{treeQuery.data.map((node) => (
					<ModuleOption
						key={node.id}
						node={node}
						onSelect={onSelect}
						selectedModuleId={selectedModuleId}
					/>
				))}
			</ul>
		</nav>
	);
}
