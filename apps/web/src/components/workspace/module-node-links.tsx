import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { buttonVariants } from "@automationstack/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@automationstack/ui/components/tooltip";
import { cn } from "@automationstack/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { FolderIcon, NetworkIcon } from "lucide-react";
import { useCallback } from "react";

import {
	clearCaseSelection,
	type WorkspaceSearch,
} from "@/components/workspace/workspace-search";

/**
 * 选中该模块。列表与脑图共用 URL 上的同一个 `moduleId`，所以模块名链接与
 * 脑图链接必须用同一个 reducer —— 两处各写一遍迟早会分叉。
 */
function useSelectModuleSearch(moduleId: string) {
	return useCallback(
		(prev: WorkspaceSearch) => ({
			...clearCaseSelection(prev),
			moduleId,
			// 换模块相当于换了一份列表，停在旧页码上多半是空页。
			page: undefined,
		}),
		[moduleId]
	);
}

/*
 * 层级字号查表：下标即 depth（根为 0），越深一档越小，见 index.css 里的
 * text-tree-* 定义。缩进（ps-3）在深层会被面板宽度吃掉，字号是第二条
 * 不占横向空间的层级线索。
 *
 * 刻意在第三档封底、超出的层级一律取最后一档：模块树的深度没有上限，
 * 而中文低于 12px 笔画就糊成一团（西文还能读，中文不行），
 * 无限递减等于把深层模块变成谁也认不出的灰条。
 */
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
	node: ModuleTreeNode;
}

interface ModuleNameLinkProps extends ModuleNodeLinkProps {
	/** 根节点为 0；只用来挑字号档位，缩进仍由 CollapsibleContent 给。 */
	depth: number;
}

export function ModuleNodeLink({ depth, node }: ModuleNameLinkProps) {
	const selectModule = useSelectModuleSearch(node.id);

	/*
	 * 悬停弹出模块全名：名字被 truncate 截断之后，行里剩下的那一截认不出是哪个模块。
	 * side="right" —— 右边就是主内容区，横向有余量；朝上/下弹会盖住相邻行，
	 * 而相邻行恰恰是用户拿来比对的东西。
	 *
	 * 触发器直接是这个 <Link>（走 render prop），不在外面再套一层元素：
	 * 套一层就会有别的节点挡在 <a> 前面，而 Cmd / 中键开新标签页只认真正的 <a href>。
	 *
	 * 读屏不会把模块名念两遍：Base UI 1.7 的 tooltip 既不给触发器挂
	 * aria-describedby，也不给气泡挂 role="tooltip"（trigger 只合并了
	 * clientPoint / dismiss 的 reference props），气泡对读屏是完全透明的；
	 * 而模块全名本来就完整躺在 DOM 里，truncate 只是视觉截断，读屏读到的一直是全名。
	 */
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
						{/* 图标不跟着字号缩：缩到第三档就只剩 12px，和左边同样在缩的展开箭头
						    一起会小到点不准；固定 size-3.5 还能让整列图标落在同一条竖线上 */}
						<FolderIcon className="icon-stroke-regular size-3.5 shrink-0 text-muted-foreground" />
						<span className="truncate">{node.name}</span>
					</Link>
				}
			/>
			<TooltipContent side="right">{node.name}</TooltipContent>
		</Tooltip>
	);
}

/**
 * 只画这个模块子树的脑图。
 *
 * 必须是真 `<Link>`（渲染成 `<a href>`）：Cmd/中键点击要能在新标签页里开。
 * 也刻意不做成 hover 才显形（隔壁的操作菜单是那样）：触屏没有 hover，
 * 而这是「按模块看脑图」的主入口，够不着等于没有。
 */
export function ModuleMindmapLink({ node }: ModuleNodeLinkProps) {
	const scopeToModule = useSelectModuleSearch(node.id);

	return (
		<Link
			// 与同一行的操作菜单保持同一句式：读屏的按钮列表里全是同名项就分不清了。
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
