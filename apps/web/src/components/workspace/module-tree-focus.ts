import type { ModuleNameEndTrigger } from "@/components/workspace/module-name-input";

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

/**
 * 就地编辑结束后决定焦点去哪里。用户点击别处（失去焦点）结束编辑时，
 * 焦点留在用户点击的地方；Enter 或 Esc 结束时，焦点回到 focus 指定的位置。
 */
export function restoreFocusAfterEdit(
	trigger: ModuleNameEndTrigger,
	focus: () => void
): void {
	if (trigger !== "blur") {
		focus();
	}
}
