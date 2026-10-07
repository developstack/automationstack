import { buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { LayersIcon, NetworkIcon } from "lucide-react";

import { clearModuleSelection } from "@/components/workspace/workspace-search";

interface MindmapScopeBarProps {
	moduleName: string | undefined;
	projectId: string;
}

export function MindmapScopeBar({
	moduleName,
	projectId,
}: MindmapScopeBarProps) {
	return (
		<div
			className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted px-4 py-1.5 text-sm"
			data-testid="mindmap-scope-bar"
		>
			<p className="flex min-w-0 items-center gap-1.5">
				<NetworkIcon className="icon-stroke-regular size-3.5 shrink-0 text-muted-foreground" />
				<span className="shrink-0 text-muted-foreground">当前只看模块</span>
				<span className="truncate font-medium">{moduleName ?? "—"}</span>
			</p>
			<Link
				className={buttonVariants({
					className: "ml-auto",
					size: "xs",
					variant: "outline",
				})}
				params={{ projectId }}
				search={clearModuleSelection}
				to="/projects/$projectId/mindmap"
			>
				<LayersIcon data-icon="inline-start" />
				返回全量脑图
			</Link>
		</div>
	);
}
