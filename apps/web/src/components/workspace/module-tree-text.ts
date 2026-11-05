/** 层级越深，名称的字号越小（见 index.css 的 text-tree-*） */
const TREE_TEXT_CLASSES = [
	"text-tree-1",
	"text-tree-2",
	"text-tree-3",
] as const;

const MAX_TREE_DEPTH_STEP = TREE_TEXT_CLASSES.length - 1;

/**
 * 树里第 depth 层的名称字号。模块树和测试任务左栏的模块分组共用这一套，
 * 两处的层级看起来才一致。
 */
export function treeTextClass(depth: number): string {
	return (
		TREE_TEXT_CLASSES[Math.min(depth, MAX_TREE_DEPTH_STEP)] ??
		TREE_TEXT_CLASSES[0]
	);
}
