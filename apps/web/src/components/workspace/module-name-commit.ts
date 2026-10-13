export const MODULE_NAME_REQUIRED = "请输入模块名称";

/** enter：用户按 Enter 确认；blur：输入框失去焦点 */
export type ModuleNameCommitTrigger = "blur" | "enter";

export type ModuleNameCommit =
	| { kind: "cancel" }
	| { kind: "invalid"; message: string }
	| { kind: "save"; name: string };

/**
 * 就地编辑模块名称时，决定保存、取消还是提示错误。
 * original 是原来的名称，新建时为空字符串。
 * 名称为空时，按 Enter 提示原因；失去焦点表示放弃，所以取消。
 */
export function decideModuleNameCommit(
	value: string,
	original: string,
	trigger: ModuleNameCommitTrigger
): ModuleNameCommit {
	const name = value.trim();
	if (name === "") {
		return trigger === "enter"
			? { kind: "invalid", message: MODULE_NAME_REQUIRED }
			: { kind: "cancel" };
	}
	if (name === original.trim()) {
		return { kind: "cancel" };
	}
	return { kind: "save", name };
}
