import { useCallback, useState } from "react";

/** 删除前确认：记录要删除的条目，确认后才删除。 */
export function useRemoveConfirm(remove: (entry: string) => void) {
	const [pending, setPending] = useState<string | null>(null);
	const cancel = useCallback(() => setPending(null), []);
	const confirm = useCallback(() => {
		if (pending !== null) {
			remove(pending);
		}
		setPending(null);
	}, [pending, remove]);
	return { ask: setPending, cancel, confirm, open: pending !== null };
}
