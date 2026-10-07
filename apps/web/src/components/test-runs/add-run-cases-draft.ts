import { useCallback, useState } from "react";

import { isTestRunDraftDirty } from "@/components/test-runs/test-run-draft";
import { useAddRunCases } from "@/components/test-runs/use-test-run-mutations";
import { useUnsavedCloseGuard } from "@/components/wide-sheet-shell";

const NO_TEXT_FIELDS = { description: "", name: "" };

interface AddRunCasesDraftInput {
	onClose: () => void;
	runId: string;
}

export function useAddRunCasesDraft({ onClose, runId }: AddRunCasesDraftInput) {
	const [caseIds, setCaseIds] = useState<string[]>([]);

	const close = useCallback(() => {
		setCaseIds([]);
		onClose();
	}, [onClose]);
	const add = useAddRunCases(close);
	const guard = useUnsavedCloseGuard(
		isTestRunDraftDirty(
			{ ...NO_TEXT_FIELDS, caseIds },
			{ ...NO_TEXT_FIELDS, caseIds: [] }
		),
		close
	);
	const requestClose = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	const blocked = caseIds.length === 0 || add.isPending;
	const handleSubmit = useCallback(() => {
		if (!blocked) {
			add.mutate({ caseIds, runId });
		}
	}, [add, blocked, caseIds, runId]);

	return {
		blocked,
		caseIds,
		guard,
		handleSubmit,
		pending: add.isPending,
		requestClose,
		setCaseIds,
	};
}
