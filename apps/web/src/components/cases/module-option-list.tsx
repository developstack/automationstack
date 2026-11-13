import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { FolderIcon } from "lucide-react";
import { useCallback } from "react";
import { TruncatedText } from "@/components/interaction/truncated-text";

export const MODULE_OPTION_ROW_CLASS =
	"relative flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-left text-sm before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-foreground";
export const MODULE_OPTION_SELECTED_CLASS = "bg-accent before:opacity-100";
export const MODULE_OPTION_IDLE_CLASS = "before:opacity-0 hover:bg-accent/50";

export const MODULE_OPTION_ICON_CLASS =
	"icon-stroke-regular size-3.5 shrink-0 text-muted-foreground";

interface ModuleOptionListProps {
	className?: string;
	nodes: readonly ModuleTreeNode[];
	onSelect: (moduleId: string) => void;
	selectedModuleId: string | undefined;
}

interface ModuleOptionProps
	extends Omit<ModuleOptionListProps, "className" | "nodes"> {
	node: ModuleTreeNode;
}

function ModuleOption({ node, onSelect, selectedModuleId }: ModuleOptionProps) {
	const handleSelect = useCallback(
		() => onSelect(node.id),
		[node.id, onSelect]
	);
	const selected = selectedModuleId === node.id;

	return (
		<li>
			<Button
				aria-current={selected ? "true" : undefined}
				className={cn(
					MODULE_OPTION_ROW_CLASS,
					selected ? MODULE_OPTION_SELECTED_CLASS : MODULE_OPTION_IDLE_CLASS
				)}
				onClick={handleSelect}
				type="button"
				variant="plain"
			>
				<FolderIcon aria-hidden="true" className={MODULE_OPTION_ICON_CLASS} />
				<TruncatedText text={node.name} />
			</Button>
			{node.children.length > 0 ? (
				<ModuleOptionList
					className="ps-3"
					nodes={node.children}
					onSelect={onSelect}
					selectedModuleId={selectedModuleId}
				/>
			) : null}
		</li>
	);
}

/** 模块树，每个模块是一个按钮，选中的模块高亮。子模块缩进。 */
export function ModuleOptionList({
	className,
	nodes,
	onSelect,
	selectedModuleId,
}: ModuleOptionListProps) {
	return (
		<ul className={className}>
			{nodes.map((node) => (
				<ModuleOption
					key={node.id}
					node={node}
					onSelect={onSelect}
					selectedModuleId={selectedModuleId}
				/>
			))}
		</ul>
	);
}

/** 模块树中的所有模块，包括所有子模块，父模块在子模块前面。 */
function flattenModules(nodes: readonly ModuleTreeNode[]): ModuleTreeNode[] {
	return nodes.flatMap((node) => [node, ...flattenModules(node.children)]);
}

/** 在模块树中按 id 找模块。找不到时返回 undefined。 */
export function findModuleNode(
	nodes: readonly ModuleTreeNode[],
	moduleId: string
): ModuleTreeNode | undefined {
	return flattenModules(nodes).find((node) => node.id === moduleId);
}

/** 模块树中的模块总数，包括所有子模块。 */
export function countModules(nodes: readonly ModuleTreeNode[]): number {
	return flattenModules(nodes).length;
}
