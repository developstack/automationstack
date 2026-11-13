import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { FolderIcon } from "lucide-react";
import { TruncatedText } from "@/components/interaction/truncated-text";
import { moduleLinkAttributes } from "@/components/workspace/module-tree-focus";
import { treeTextClass } from "@/components/workspace/module-tree-text";
import { useSelectModuleSearch } from "@/components/workspace/use-select-module-search";

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
			<TruncatedText text={node.name} />
		</Link>
	);
}
