import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { NetworkIcon } from "lucide-react";

import { useSelectModuleSearch } from "@/components/workspace/use-select-module-search";

interface ModuleMindmapLinkProps {
	node: ModuleTreeNode;
}

export function ModuleMindmapLink({ node }: ModuleMindmapLinkProps) {
	const scopeToModule = useSelectModuleSearch(node.id);

	return (
		<Link
			aria-label={`模块「${node.name}」脑图`}
			className={buttonVariants({
				className: "text-muted-foreground",
				size: "icon-xs",
				variant: "ghost",
			})}
			params={{ projectId: node.projectId }}
			search={scopeToModule}
			to="/projects/$projectId/mindmap"
		>
			<NetworkIcon />
		</Link>
	);
}
