/**
 * 用例选择器左栏的模块树。
 *
 * 刻意不复用 `components/workspace/module-tree.tsx`：那一棵挂着拖拽排序、
 * 右键菜单、新建/删除对话框，而且选中态直接读写 URL 上的 `moduleId`——
 * 放进对话框里点一下模块，背后的用例列表页就跟着换了。这里要的只是
 * 「把范围缩到某个模块」这一件事，所以是一棵只读的、纯受控的树。
 */
import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { cn } from "@automationstack/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FolderIcon, LayersIcon } from "lucide-react";
import { useCallback } from "react";

import { orpc } from "@/utils/orpc";

/** 行样式与侧栏那棵树同档：选中态除了底色还有左侧 2px 指示条，不只靠颜色。 */
const ROW_CLASS =
	"relative flex min-h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-left text-sm before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-foreground";
const ROW_SELECTED_CLASS = "bg-accent before:opacity-100";
const ROW_IDLE_CLASS = "before:opacity-0 hover:bg-accent/50";

const ICON_CLASS = "size-3.5 shrink-0 text-muted-foreground";

interface ModuleOptionProps {
	node: ModuleTreeNode;
	onSelect: (moduleId: string | undefined) => void;
	selectedModuleId: string | undefined;
}

/**
 * 一个模块节点及其子树。
 *
 * 全展开、不做折叠：选择器一次只活几十秒，多一颗折叠箭头就多一次「我要的那个
 * 模块藏在哪一支下面」的翻找。深层缩进由嵌套 `<ul>` 的 ps-3 给，不用行内样式。
 */
function ModuleOption({ node, onSelect, selectedModuleId }: ModuleOptionProps) {
	const handleSelect = useCallback(
		() => onSelect(node.id),
		[node.id, onSelect]
	);
	const selected = selectedModuleId === node.id;

	return (
		<li>
			<button
				aria-current={selected ? "true" : undefined}
				className={cn(
					ROW_CLASS,
					selected ? ROW_SELECTED_CLASS : ROW_IDLE_CLASS
				)}
				onClick={handleSelect}
				type="button"
			>
				<FolderIcon aria-hidden="true" className={ICON_CLASS} />
				<span className="truncate">{node.name}</span>
			</button>
			{node.children.length > 0 ? (
				<ul className="ps-3">
					{node.children.map((child) => (
						<ModuleOption
							key={child.id}
							node={child}
							onSelect={onSelect}
							selectedModuleId={selectedModuleId}
						/>
					))}
				</ul>
			) : null}
		</li>
	);
}

const SKELETON_KEYS = ["m1", "m2", "m3", "m4"] as const;

function ModulesFallback() {
	return (
		<output
			aria-busy="true"
			aria-label="模块树加载中"
			className="flex flex-col gap-1 p-2"
		>
			{SKELETON_KEYS.map((key) => (
				<Skeleton className="h-7 w-full" key={key} />
			))}
		</output>
	);
}

interface CasePickerModulesProps {
	onSelect: (moduleId: string | undefined) => void;
	projectId: string;
	selectedModuleId: string | undefined;
}

/**
 * 只读模块树 + 顶上的「全部用例」。
 *
 * 用 `useQuery` 而不是 `useSuspenseQuery`：这棵树挂在对话框里，外面没有
 * Suspense 边界，挂起会一路冒到根布局把整个外壳变空白
 * （同 layout/module-panel.tsx 里那段的理由）。
 */
export function CasePickerModules({
	onSelect,
	projectId,
	selectedModuleId,
}: CasePickerModulesProps) {
	const treeQuery = useQuery(
		orpc.modules.tree.queryOptions({ input: { projectId } })
	);
	const selectAll = useCallback(() => onSelect(undefined), [onSelect]);

	if (!treeQuery.data) {
		return <ModulesFallback />;
	}

	return (
		<nav aria-label="按模块筛选用例" className="flex flex-col gap-1 p-2">
			<button
				aria-current={selectedModuleId === undefined ? "true" : undefined}
				className={cn(
					ROW_CLASS,
					selectedModuleId === undefined ? ROW_SELECTED_CLASS : ROW_IDLE_CLASS
				)}
				onClick={selectAll}
				type="button"
			>
				<LayersIcon aria-hidden="true" className={ICON_CLASS} />
				全部用例
			</button>
			<ul>
				{treeQuery.data.map((node) => (
					<ModuleOption
						key={node.id}
						node={node}
						onSelect={onSelect}
						selectedModuleId={selectedModuleId}
					/>
				))}
			</ul>
		</nav>
	);
}
