/**
 * 模块行末尾那枚「看这棵子树的脑图」链接。原与 ModuleNodeLink 同住
 * module-node-links.tsx，按「一个文件一个对外组件」拆开。
 */
import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { NetworkIcon } from "lucide-react";

import { useSelectModuleSearch } from "@/components/workspace/use-select-module-search";

interface ModuleMindmapLinkProps {
	node: ModuleTreeNode;
}

/**
 * 只画这个模块子树的脑图。
 *
 * 必须是真 `<Link>`（渲染成 `<a href>`）：Cmd/中键点击要能在新标签页里开。
 * 也刻意不做成 hover 才显形（隔壁的操作菜单是那样）：触屏没有 hover，
 * 而这是「按模块看脑图」的主入口，够不着等于没有。
 */
export function ModuleMindmapLink({ node }: ModuleMindmapLinkProps) {
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
