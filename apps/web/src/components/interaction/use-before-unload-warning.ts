import { useBlocker } from "@tanstack/react-router";

const NEVER_BLOCK_IN_APP = () => false;

/**
 * 有未保存的修改时，关闭或刷新标签页由浏览器提醒。站内跳转不拦截：
 * 面板的关闭也是一次站内跳转，由面板自己的关闭提醒处理。
 * 整个页面是一个表单时，使用 UnsavedChangesGuard。
 */
export function useBeforeUnloadWarning(dirty: boolean): void {
	useBlocker({
		disabled: !dirty,
		enableBeforeUnload: dirty,
		shouldBlockFn: NEVER_BLOCK_IN_APP,
	});
}
