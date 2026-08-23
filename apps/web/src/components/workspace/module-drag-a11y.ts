/**
 * 模块树拖拽的读屏播报（dnd-kit 默认文案是英文）。
 * 落点 id 里带的是模块 uuid，念出来对用户没有意义，
 * 因此播报把 uuid 映射回模块名——只说「插到之前 / 挂到之下」不带名字的话，
 * 连按方向键会得到多句一模一样的播报，纯听觉无从判断走到了哪、有没有走。
 */
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

/** 播报文案依赖当前树（要按 id 查名字），因此按树生成而不是全局常量。 */
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
