import { type ChangeEvent, type FormEvent, useCallback, useState } from "react";

import {
	isTestRunDraftDirty,
	type TestRunDraft,
} from "@/components/test-runs/test-run-draft";
import { useCreateTestRunFromFailed } from "@/components/test-runs/use-test-run-list-mutations";
import { useUnsavedCloseGuard } from "@/components/wide-sheet-shell";

function initialDraft(sourceName: string): TestRunDraft {
	return { caseIds: [], description: "", name: `${sourceName} 重测` };
}

interface RetestDraftInput {
	onClose: () => void;
	sourceName: string;
}

export function useRetestDraft({ onClose, sourceName }: RetestDraftInput) {
	const [draft, setDraft] = useState(() => initialDraft(sourceName));

	const close = useCallback(() => {
		setDraft(initialDraft(sourceName));
		onClose();
	}, [onClose, sourceName]);
	const create = useCreateTestRunFromFailed(close);
	const guard = useUnsavedCloseGuard(
		isTestRunDraftDirty(draft, initialDraft(sourceName)),
		close
	);
	const requestClose = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	return { create, draft, guard, requestClose, setDraft };
}

export type RetestDraft = ReturnType<typeof useRetestDraft>;

export interface RetestFormState {
	blocked: boolean;
	onDescriptionChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
	onNameChange: (event: ChangeEvent<HTMLInputElement>) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	pending: boolean;
}

function retestInput(draft: TestRunDraft, sourceRunId: string) {
	return {
		description: draft.description.trim() === "" ? null : draft.description,
		name: draft.name.trim(),
		sourceRunId,
	};
}

export function useRetestForm(
	retest: RetestDraft,
	sourceRunId: string
): RetestFormState {
	const { create, draft, setDraft } = retest;

	const handleName = useCallback(
		(event: ChangeEvent<HTMLInputElement>) =>
			setDraft((prev) => ({ ...prev, name: event.target.value })),
		[setDraft]
	);
	const handleDescription = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) =>
			setDraft((prev) => ({ ...prev, description: event.target.value })),
		[setDraft]
	);

	const blocked = draft.name.trim() === "" || create.isPending;
	const handleSubmit = useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (blocked) {
				return;
			}
			create.mutate(retestInput(draft, sourceRunId));
		},
		[blocked, create, draft, sourceRunId]
	);

	return {
		blocked,
		onDescriptionChange: handleDescription,
		onNameChange: handleName,
		onSubmit: handleSubmit,
		pending: create.isPending,
	};
}
