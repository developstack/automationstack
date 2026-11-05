import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@automationstack/ui/components/collapsible";
import { cn } from "@automationstack/ui/lib/utils";
import { ChevronRightIcon, FolderIcon } from "lucide-react";
import { useCallback } from "react";

import type { RunCaseGroup } from "@/components/test-runs/run-case-groups";
import {
	type RunCaseRowContext,
	RunCaseRows,
} from "@/components/test-runs/run-case-rows";
import { treeTextClass } from "@/components/workspace/module-tree-text";
import type { ModuleExpansion } from "@/components/workspace/use-module-expansion";

/** 子层的缩进和竖线跟模块树一致（见 workspace/module-node-item.tsx） */
const CHILDREN_CLASS = "ms-4 border-border border-s ps-0.5";

const HEADER_CLASS =
	"flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

const HEADER_ICON_CLASS =
	"icon-stroke-regular size-3.5 shrink-0 text-muted-foreground";

interface RunCaseGroupHeaderProps {
	caseCount: number;
	depth: number;
	moduleName: string;
	open: boolean;
}

function RunCaseGroupHeader({
	caseCount,
	depth,
	moduleName,
	open,
}: RunCaseGroupHeaderProps) {
	return (
		<CollapsibleTrigger
			aria-label={`${moduleName} 模块，${caseCount} 条用例`}
			className={HEADER_CLASS}
		>
			<ChevronRightIcon
				aria-hidden="true"
				className={cn(
					HEADER_ICON_CLASS,
					"transition-transform duration-150 ease-out",
					open && "rotate-90"
				)}
			/>
			<FolderIcon aria-hidden="true" className={HEADER_ICON_CLASS} />
			<span className={cn("min-w-0 flex-1 truncate", treeTextClass(depth))}>
				{moduleName}
			</span>
			<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
				{caseCount}
			</span>
		</CollapsibleTrigger>
	);
}

export interface RunCaseGroupItemProps extends RunCaseRowContext {
	depth: number;
	expansion: ModuleExpansion;
	group: RunCaseGroup;
}

/**
 * 左栏的一组用例：模块行可折叠，展开后先列本模块的用例，再列子模块的分组。
 * 层级越深字号越小、缩进越多，和用例页的模块树一致。
 */
export function RunCaseGroupItem({
	depth,
	expansion,
	group,
	...rows
}: RunCaseGroupItemProps) {
	const open = expansion.isOpen(group.moduleId, depth);
	const handleOpenChange = useCallback(
		(next: boolean) => expansion.setOpen(group.moduleId, next),
		[expansion, group.moduleId]
	);

	return (
		<Collapsible onOpenChange={handleOpenChange} open={open}>
			<RunCaseGroupHeader
				caseCount={group.caseCount}
				depth={depth}
				moduleName={group.moduleName}
				open={open}
			/>
			<CollapsibleContent className="collapsible-panel">
				<div className={cn("flex flex-col gap-0.5 pb-1", CHILDREN_CLASS)}>
					{group.cases.length > 0 ? (
						<RunCaseRows {...rows} cases={group.cases} />
					) : null}
					{group.children.length > 0 ? (
						<ul className="flex flex-col gap-0.5">
							{group.children.map((child) => (
								<li key={child.moduleId}>
									<RunCaseGroupItem
										{...rows}
										depth={depth + 1}
										expansion={expansion}
										group={child}
									/>
								</li>
							))}
						</ul>
					) : null}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
