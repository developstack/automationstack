import { buttonVariants } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { LayersIcon, NetworkIcon } from "lucide-react";

import { clearModuleSelection } from "@/components/workspace/workspace-search";

/**
 * 模块树顶上的第 0 行：不选任何模块，看这个项目的全部用例。
 *
 * 单独成文件而不是留在 module-tree.tsx 里：那个文件已经贴着 300 行的上限，
 * 而这一行是自洽的一小块——只依赖 projectId 与选中态，不碰拖拽与展开。
 */
interface AllCasesLinkProps {
	projectId: string;
	selected: boolean;
}

export function AllCasesLink({ projectId, selected }: AllCasesLinkProps) {
	return (
		// px-2 与模块行同档：加上 aside 的 p-2 正好落在 16px 的侧栏 gutter 上。
		<div
			className={cn(
				"flex items-center gap-1 rounded-md px-2 py-0.5",
				// 这一行坐在 bg-sidebar 上（secondary-panel.tsx），底色与悬停都得走侧栏那套令牌。
				// before:* 是选中态的左侧 2px 指示条，绝对定位、不占流内空间，不动 px-2 那笔账。
				"relative before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-foreground",
				selected
					? "bg-sidebar-selected before:opacity-100"
					: "before:opacity-0 hover:bg-sidebar-accent"
			)}
		>
			<Link
				className="flex min-w-0 flex-1 items-center gap-1.5 text-sm"
				params={{ projectId }}
				search={clearModuleSelection}
				to="/projects/$projectId"
			>
				<LayersIcon className="icon-stroke-regular size-3.5 shrink-0 text-muted-foreground" />
				全部用例
			</Link>
			{/*
			 * 全项目脑图。每个模块行都带一枚「本模块脑图」，唯独不带作用域的那张图
			 * 没有归属的行——它对应的正是「全部用例」这一行：search 走
			 * clearModuleSelection，落到脑图页时不带 moduleId。
			 * 一级侧栏的脑图入口撤掉之后，这里是进全项目脑图的唯一入口，
			 * 所以和模块行的那枚一样，刻意不做成 hover 才显形。
			 *
			 * 行尾不再需要任何占位：模块行的操作菜单已经从行尾的「⋯」按钮改成了
			 * 整行右键菜单（module-tree-node.tsx），所有行的行尾都由脑图图标自己收口，
			 * 与模块树标题行的「＋」一起落在同一条竖线上。
			 */}
			<Link
				aria-label="全项目脑图"
				className={buttonVariants({
					className: "text-muted-foreground",
					size: "icon-xs",
					variant: "ghost",
				})}
				params={{ projectId }}
				search={clearModuleSelection}
				to="/projects/$projectId/mindmap"
			>
				<NetworkIcon />
			</Link>
		</div>
	);
}
