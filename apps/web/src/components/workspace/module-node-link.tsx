import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@automationstack/ui/components/tooltip";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { FolderIcon } from "lucide-react";

import { useSelectModuleSearch } from "@/components/workspace/use-select-module-search";

const TREE_TEXT_CLASSES = [
	"text-tree-1",
	"text-tree-2",
	"text-tree-3",
] as const;
const MAX_TREE_DEPTH_STEP = TREE_TEXT_CLASSES.length - 1;

function treeTextClass(depth: number): string {
	return TREE_TEXT_CLASSES[Math.min(depth, MAX_TREE_DEPTH_STEP)];
}

interface ModuleNameLinkProps {
	depth: number;
	node: ModuleTreeNode;
}

export function ModuleNodeLink({ depth, node }: ModuleNameLinkProps) {
	const selectModule = useSelectModuleSearch(node.id);

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Link
						className={cn(
							"flex min-w-0 flex-1 items-center gap-1.5",
							treeTextClass(depth)
						)}
						params={{ projectId: node.projectId }}
						search={selectModule}
						to="/projects/$projectId"
					>
						<FolderIcon className="icon-stroke-regular pointer-events-none size-3.5 shrink-0 text-muted-foreground transition-opacity group-hover/module-row:opacity-0 group-has-[[data-drag-handle]:focus-visible]/module-row:opacity-0" />
						<span className="truncate">{node.name}</span>
					</Link>
				}
			/>
			<TooltipContent side="right">{node.name}</TooltipContent>
		</Tooltip>
	);
}
