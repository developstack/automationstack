import { useCallback } from "react";

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
