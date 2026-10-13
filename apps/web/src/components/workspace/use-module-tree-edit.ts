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

export interface ModuleTreeEditing {
	edit: ModuleTreeEdit;
	startCreate: (parentId: string | null) => void;
	startDelete: (node: ModuleTreeNode) => void;
	startRename: (moduleId: string) => void;
	stop: () => void;
}

export function isRenamingModule(edit: ModuleTreeEdit, moduleId: string) {
	return edit?.kind === "rename" && edit.moduleId === moduleId;
}

export function isCreatingIn(edit: ModuleTreeEdit, parentId: string | null) {
	return edit?.kind === "create" && edit.parentId === parentId;
}

const MODULE_LINK_ATTRIBUTE = "data-module-link";

/** 模块名称链接上的属性，用来在编辑结束后把焦点放回这个模块 */
export function moduleLinkAttributes(moduleId: string) {
	return { [MODULE_LINK_ATTRIBUTE]: moduleId };
}

/** 编辑结束后，在下一帧把焦点放到模块的名称链接上（这时树已经重新渲染）。 */
export function focusModuleLink(moduleId: string): void {
	requestAnimationFrame(() => {
		const link = document.querySelector<HTMLElement>(
			`[${MODULE_LINK_ATTRIBUTE}="${CSS.escape(moduleId)}"]`
		);
		link?.focus();
	});
}

const CREATE_ROOT_ATTRIBUTE = "data-module-create-root";

/** 「新建根模块」按钮上的属性。取消新建根模块后，焦点回到这个按钮 */
export const createRootButtonAttributes = { [CREATE_ROOT_ATTRIBUTE]: "" };

/** 按 Esc 取消新建后，焦点回到开始新建的地方：父模块，或「新建根模块」按钮。 */
export function focusCreateOrigin(parentId: string | null): void {
	if (parentId !== null) {
		focusModuleLink(parentId);
		return;
	}
	requestAnimationFrame(() => {
		document.querySelector<HTMLElement>(`[${CREATE_ROOT_ATTRIBUTE}]`)?.focus();
	});
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
	const startDelete = useCallback(
		(node: ModuleTreeNode) => {
			setEdit(null);
			onDelete(node);
		},
		[onDelete]
	);
	return useMemo(
		() => ({ edit, startCreate, startDelete, startRename, stop }),
		[edit, startCreate, startDelete, startRename, stop]
	);
}
