import { useCallback } from "react";

/**
 * Base UI dialogs report open/close through a single boolean callback; this
 * adapts it to a parent-owned `onClose` while keeping the handler reference
 * stable (JSX props must not receive freshly created closures).
 */
export function useCloseOnDismiss(onClose: () => void) {
	return useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) {
				onClose();
			}
		},
		[onClose]
	);
}
