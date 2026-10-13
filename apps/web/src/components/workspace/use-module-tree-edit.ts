import type { ModuleTreeNode } from "@automationstack/api/lib/module-tree";
import { useCallback, useMemo, useState } from "react";

/**
 * 模块树中正在就地编辑的内容。一次只编辑一处：
 * 重命名一个模块，或在一个父模块（null 表示根）下新建模块。
 */
export type ModuleTreeEdit =
	| { kind: "create"; parentId: string | null }
	| { kind: "rename"; moduleId: string }
	| null;

/** 模块树的就地编辑状态，以及开始各项操作的入口。删除不在树中编辑，而是打开确认对话框 */
export interface ModuleTreeEditing {
	edit: ModuleTreeEdit;
	requestDelete: (node: ModuleTreeNode) => void;
	startCreate: (parentId: string | null) => void;
	startRename: (moduleId: string) => void;
	stop: () => void;
}

export function isRenamingModule(edit: ModuleTreeEdit, moduleId: string) {
	return edit?.kind === "rename" && edit.moduleId === moduleId;
}

export function isCreatingIn(edit: ModuleTreeEdit, parentId: string | null) {
	return edit?.kind === "create" && edit.parentId === parentId;
}

export function useModuleTreeEdit(
	onDelete: (node: ModuleTreeNode) => void,
	onRevealParent: (parentId: string) => void
): ModuleTreeEditing {
	const [edit, setEdit] = useState<ModuleTreeEdit>(null);
	const stop = useCallback(() => setEdit(null), []);
	const startRename = useCallback(
		(moduleId: string) => setEdit({ kind: "rename", moduleId }),
		[]
	);
	const startCreate = useCallback(
		(parentId: string | null) => {
			if (parentId !== null) {
				onRevealParent(parentId);
			}
			setEdit({ kind: "create", parentId });
		},
		[onRevealParent]
	);
	const requestDelete = useCallback(
		(node: ModuleTreeNode) => {
			setEdit(null);
			onDelete(node);
		},
		[onDelete]
	);
	return useMemo(
		() => ({ edit, requestDelete, startCreate, startRename, stop }),
		[edit, startCreate, requestDelete, startRename, stop]
	);
}
