/**
 * 两个版本之间一处内容的变化。步骤按这五种分类；
 * 名称、前置条件和标签等字段只用「修改」或「未变」。
 */
export type ChangeKind =
	| "added"
	| "modified"
	| "moved"
	| "removed"
	| "unchanged";

export const CHANGE_KIND_LABELS: Record<ChangeKind, string> = {
	added: "新增",
	modified: "修改",
	moved: "移动",
	removed: "删除",
	unchanged: "未变",
};
