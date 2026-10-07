import { type FormEvent, useCallback, useState } from "react";

import {
	isTestRunDraftDirty,
	type TestRunDraft,
} from "@/components/test-runs/test-run-draft";
import { useCreateTestRun } from "@/components/test-runs/use-test-run-list-mutations";
import { useUnsavedCloseGuard } from "@/components/wide-sheet-shell";

const EMPTY_DRAFT: TestRunDraft = { caseIds: [], description: "", name: "" };

function blockedHint(draft: TestRunDraft, pending: boolean): string | null {
	if (pending) {
		return null;
	}
	if (draft.name.trim() === "") {
		return "请先填写测试任务名称。";
	}
	if (draft.caseIds.length === 0) {
		return "请至少勾选一条用例。";
	}
	return null;
}

interface CreateSubmitInput {
	blocked: boolean;
	create: ReturnType<typeof useCreateTestRun>;
	draft: TestRunDraft;
	projectId: string;
}

function useCreateSubmit({
	blocked,
	create,
	draft,
	projectId,
}: CreateSubmitInput) {
	return useCallback(
		(event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			if (blocked) {
				return;
			}
			create.mutate({
				caseIds: draft.caseIds,
				description: draft.description.trim() === "" ? null : draft.description,
				name: draft.name.trim(),
				projectId,
			});
		},
		[blocked, create, draft, projectId]
	);
}

export function useCreateRunDraft(projectId: string, onClose: () => void) {
	const [draft, setDraft] = useState<TestRunDraft>(EMPTY_DRAFT);

	const close = useCallback(() => {
		setDraft(EMPTY_DRAFT);
		onClose();
	}, [onClose]);
	const create = useCreateTestRun(close);
	const guard = useUnsavedCloseGuard(
		isTestRunDraftDirty(draft, EMPTY_DRAFT),
		close
	);
	const requestClose = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	const setName = useCallback(
		(name: string) => setDraft((prev) => ({ ...prev, name })),
		[]
	);
	const setDescription = useCallback(
		(description: string) => setDraft((prev) => ({ ...prev, description })),
		[]
	);
	const setCaseIds = useCallback(
		(caseIds: string[]) => setDraft((prev) => ({ ...prev, caseIds })),
		[]
	);

	const blocked =
		draft.name.trim() === "" || draft.caseIds.length === 0 || create.isPending;

	const handleSubmit = useCreateSubmit({ blocked, create, draft, projectId });

	return {
		blocked,
		draft,
		guard,
		handleSubmit,
		hint: blockedHint(draft, create.isPending),
		pending: create.isPending,
		requestClose,
		setCaseIds,
		setDescription,
		setName,
	};
}

export type CreateRunController = ReturnType<typeof useCreateRunDraft>;
