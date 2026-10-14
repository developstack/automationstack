import { useCallback, useRef } from "react";

export interface ModuleMenuActions {
	onCreateChild: () => void;
	onDelete: () => void;
	onRename: () => void;
}

export interface ModuleMenuProps extends ModuleMenuActions {
	name: string;
}

/**
 * 重命名和新建子模块会在树中出现输入框，输入框自己获得焦点。
 * 这时菜单关闭后不能把焦点还给触发器，否则输入框会失去焦点。
 * 其他情况（Esc 关闭、选择删除）按默认行为还给触发器。
 * finalFocus 传给菜单弹层的 finalFocus 属性。
 */
export function useInlineEditFocus(actions: ModuleMenuActions) {
	const startedInlineEdit = useRef(false);
	const finalFocus = useCallback(() => {
		const restore = !startedInlineEdit.current;
		startedInlineEdit.current = false;
		return restore;
	}, []);
	const { onCreateChild, onRename } = actions;
	const rename = useCallback(() => {
		startedInlineEdit.current = true;
		onRename();
	}, [onRename]);
	const createChild = useCallback(() => {
		startedInlineEdit.current = true;
		onCreateChild();
	}, [onCreateChild]);
	return { createChild, finalFocus, rename };
}
