/**
 * 作用域视图的抬头：说清「现在看的是哪个模块」，并给出回到全量脑图的出口。
 *
 * 没有这条抬头，用户点进某个模块的脑图之后画布上只有一棵子树，看起来像
 * 数据丢了，而且没有任何回到全量的入口 —— 会直接困在一个模块里。
 */
import { buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { LayersIcon, NetworkIcon } from "lucide-react";

import { clearModuleSelection } from "@/components/workspace/workspace-search";

interface MindmapScopeBarProps {
	/** 作用域根模块名；来自 `mindmap.tree` 返回的那唯一一棵子树。 */
	moduleName: string | undefined;
	projectId: string;
}

export function MindmapScopeBar({
	moduleName,
	projectId,
}: MindmapScopeBarProps) {
	return (
		// flex-wrap：窄屏下抬头换行，而不是把出口链接挤出视口
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
