import { Button, buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { NetworkIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { clearModuleSelection } from "@/components/workspace/workspace-search";

/**
 * 侧栏里「模块」这一组的外壳：标题行 + 全项目脑图 + 新建根模块，底下直接装模块树。
 *
 * 单独成组是因为 aside 里还排着一行项目级导航（未完成草稿），它明确在模块分组
 * 之外。整块 aside 叫「项目导航」，这一组另有自己的可及名称——section +
 * aria-labelledby 指向下面那个 <h2>，读屏才分得清两层。
 *
 * 单独成文件而不是留在 module-tree.tsx 里：那个文件贴着 300 行的上限，
 * 同目录的 case-drafts-link.tsx 也是这么拆出去的。
 */
const HEADING_ID = "workspace-module-section-heading";

interface ModuleSectionProps {
	children: ReactNode;
	onCreateRoot: () => void;
	projectId: string;
}

export function ModuleSection({
	children,
	onCreateRoot,
	projectId,
}: ModuleSectionProps) {
	return (
		/*
		 * 不带任何内边距：gutter 那笔账由 aside 的 p-2 与每个直接子行的 px-2
		 * 凑齐（约定见 module-tree.tsx 顶部），这层壳只接管 aside 原本的
		 * gap-1，不能再引入自己的 padding，否则组内的行会比组外的行右移。
		 */
		<section aria-labelledby={HEADING_ID} className="flex flex-col gap-1">
			<div className="flex items-center justify-between px-2">
				<h2
					className="font-medium text-muted-foreground text-xs"
					id={HEADING_ID}
				>
					模块
				</h2>
				{/* 组内操作紧挨在一起，与标题之间靠 justify-between 拉开 */}
				<div className="flex items-center">
					{/*
					 * 全项目脑图。每个模块行都带一枚「本模块脑图」，唯独不带作用域的
					 * 那张图没有归属的行——它原先挂在已经撤掉的「全部用例」行上，
					 * 而那是进全项目脑图的唯一入口（脑图页自己的「返回全量脑图」只在
					 * 已经进了某个模块的脑图之后才存在）。撤掉那一行不该顺手把这个入口
					 * 也弄没，所以搬到本组标题行上：它的作用域正是「全部模块」，
					 * 和这一组的标题是同一件事，也不多占一行。
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
					<Button
						aria-label="新建根模块"
						onClick={onCreateRoot}
						size="icon-xs"
						variant="ghost"
					>
						<PlusIcon />
					</Button>
				</div>
			</div>
			{children}
		</section>
	);
}
