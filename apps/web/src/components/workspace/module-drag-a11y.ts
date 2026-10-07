import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import type { Announcements, ScreenReaderInstructions } from "@dnd-kit/core";

import {
	findModuleNode,
	parseDropId,
} from "@/components/workspace/module-drop-plan";

export const moduleDragInstructions: ScreenReaderInstructions = {
	draggable:
		"按空格或回车键开始拖拽模块，用上下方向键在落点之间移动，再按空格或回车键放下，按 Esc 键取消。",
};

const NO_DROP = "当前没有可用落点";

function describeDrop(
	nodes: readonly ModuleTreeNode[],
	overId: string | number | undefined
): string {
	if (overId === undefined) {
		return NO_DROP;
	}
	const drop = parseDropId(String(overId));
	if (drop === null) {
		return NO_DROP;
	}
	if (drop.zone === "root-end") {
		return "落点：移到根层级末尾";
	}
	const name =
		drop.moduleId === null ? null : findModuleNode(nodes, drop.moduleId)?.name;
	if (!name) {
		return NO_DROP;
	}
	return drop.zone === "before"
		? `落点：插到「${name}」之前`
		: `落点：挂到「${name}」之下`;
}

export function createModuleDragAnnouncements(
	nodes: readonly ModuleTreeNode[]
): Announcements {
	return {
		onDragCancel: () => "已取消拖拽，模块位置未变。",
		onDragEnd: ({ over }) =>
			over === null
				? "已放下，模块位置未变。"
				: `已放下。${describeDrop(nodes, over.id)}`,
		onDragOver: ({ over }) => describeDrop(nodes, over?.id),
		onDragStart: () => "已拿起模块，用上下方向键选择落点。",
	};
}
