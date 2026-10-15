import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { FolderIcon } from "lucide-react";
import { moduleLinkAttributes } from "@/components/workspace/module-tree-focus";
import { useSelectModuleSearch } from "@/components/workspace/use-select-module-search";

/** 层级越深，名称的字号越小（见 index.css 的 text-tree-*） */
const TREE_TEXT_CLASSES = [
	"text-tree-1",
	"text-tree-2",
	"text-tree-3",
] as const;
const MAX_TREE_DEPTH_STEP = TREE_TEXT_CLASSES.length - 1;

function treeTextClass(depth: number): string {
	return TREE_TEXT_CLASSES[Math.min(depth, MAX_TREE_DEPTH_STEP)];
}

interface ModuleNodeLinkProps {
	depth: number;
	node: ModuleTreeNode;
	selected: boolean;
}

/** 模块名称：点击后在用例列表中只看这个模块。当前选中的模块用 aria-current 标出。 */
export function ModuleNodeLink({ depth, node, selected }: ModuleNodeLinkProps) {
	const selectModule = useSelectModuleSearch(node.id);

	return (
		<Link
			aria-current={selected ? "true" : undefined}
			className={cn(
				"flex min-h-7 min-w-0 flex-1 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
				treeTextClass(depth),
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
	);
}
