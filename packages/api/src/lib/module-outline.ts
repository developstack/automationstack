/**
 * 模块大纲的纯展示层拼装：把模块行渲染成带 id 的缩进文本，
 * 供 AI agent 的 list_modules 工具消费。不做任何数据访问。
 */

import type { ModuleRow, ModuleTreeNode } from "./module-tree";
import { buildModuleTree } from "./module-tree";

const INDENT_UNIT = "  ";
const EMPTY_OUTLINE = "（该项目暂无模块）";

function appendNode(
	lines: string[],
	node: ModuleTreeNode,
	depth: number
): void {
	lines.push(`${INDENT_UNIT.repeat(depth)}- ${node.name} (id: ${node.id})`);
	for (const child of node.children) {
		appendNode(lines, child, depth + 1);
	}
}

/** 缩进文本大纲，每行形如 `- 模块名 (id: uuid)`。 */
export function formatModuleOutline(rows: ModuleRow[]): string {
	const roots = buildModuleTree(rows);
	if (roots.length === 0) {
		return EMPTY_OUTLINE;
	}
	const lines: string[] = [];
	for (const root of roots) {
		appendNode(lines, root, 0);
	}
	return lines.join("\n");
}
