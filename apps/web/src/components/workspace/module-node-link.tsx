import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@automationstack/ui/components/tooltip";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { FolderIcon } from "lucide-react";
import { moduleLinkAttributes } from "@/components/workspace/use-module-tree-edit";
import { useSelectModuleSearch } from "@/components/workspace/use-select-module-search";

interface ModuleNodeLinkProps {
	node: ModuleTreeNode;
	selected: boolean;
}

/** 模块名称：点击后在用例列表中只看这个模块。当前选中的模块用 aria-current 标出。 */
export function ModuleNodeLink({ node, selected }: ModuleNodeLinkProps) {
	const selectModule = useSelectModuleSearch(node.id);

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Link
						aria-current={selected ? "page" : undefined}
						className={cn(
							"flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm text-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
							selected
								? "font-medium text-foreground"
								: "text-muted-foreground hover:text-foreground"
						)}
						params={{ projectId: node.projectId }}
						search={selectModule}
						to="/projects/$projectId"
						{...moduleLinkAttributes(node.id)}
					>
						<FolderIcon
							aria-hidden="true"
							className={cn(
								"icon-stroke-regular pointer-events-none size-3.5 shrink-0 transition-opacity group-hover/module-row:opacity-0 group-has-[[data-drag-handle]:focus-visible]/module-row:opacity-0",
								selected ? "text-foreground" : "text-muted-foreground"
							)}
						/>
						<span className="truncate">{node.name}</span>
					</Link>
				}
			/>
			<TooltipContent side="right">{node.name}</TooltipContent>
		</Tooltip>
	);
}
