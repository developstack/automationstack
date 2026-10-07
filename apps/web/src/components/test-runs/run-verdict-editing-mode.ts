import { useCallback, useState } from "react";

export interface VerdictEditingMode {
	editing: boolean;
	onEdit: (() => void) | null;
	startEditing: () => void;
	stopEditing: () => void;
}

export function useVerdictEditingMode(
	hasVerdict: boolean,
	canConclude: boolean
): VerdictEditingMode {
	const [editing, setEditing] = useState(!hasVerdict);
	const startEditing = useCallback(() => setEditing(true), []);
	const stopEditing = useCallback(() => setEditing(false), []);
	return {
		editing: canConclude && editing,
		onEdit: canConclude ? startEditing : null,
		startEditing,
		stopEditing,
	};
}
