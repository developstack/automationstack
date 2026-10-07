import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import type { PublicUser } from "@automationstack/db/schema/users";
import { useCallback } from "react";

import {
	nextRunCaseId,
	shouldAutoAdvance,
} from "@/components/test-runs/run-execution-meta";
import type {
	CheckedIds,
	RunCaseSelection,
} from "@/components/test-runs/run-execution-selection";
import {
	useAssignRunCases,
	useBulkSetRunCaseResult,
	useRemoveRunCases,
	useSaveRunCaseComment,
	useSetRunCaseResult,
} from "@/components/test-runs/use-test-run-mutations";

export interface RunCaseMutations {
	assign: ReturnType<typeof useAssignRunCases>;
	bulkSetResult: ReturnType<typeof useBulkSetRunCaseResult>;
	removeCases: ReturnType<typeof useRemoveRunCases>;
	saveComment: ReturnType<typeof useSaveRunCaseComment>;
	setResult: ReturnType<typeof useSetRunCaseResult>;
}

export function useRunCaseMutations(): RunCaseMutations {
	const setResult = useSetRunCaseResult();
	const saveComment = useSaveRunCaseComment();
	const bulkSetResult = useBulkSetRunCaseResult();
	const removeCases = useRemoveRunCases();
	const assign = useAssignRunCases();
	return { assign, bulkSetResult, removeCases, saveComment, setResult };
}

export interface RunVerdictHandlers {
	handleCommentSave: (comment: string | null) => void;
	handleReset: () => void;
	handleSelect: (runCaseId: string) => void;
	handleVerdict: (result: TestRunCaseResult) => void;
}

export interface RunVerdictHandlerOptions {
	mutations: RunCaseMutations;
	onSelectRunCase: (runCaseId: string | undefined) => void;
	selection: RunCaseSelection;
}

export function useRunVerdictHandlers(
	options: RunVerdictHandlerOptions
): RunVerdictHandlers {
	const { onSelectRunCase } = options;
	const { saveComment, setResult } = options.mutations;
	const { selected, visibleCases } = options.selection;

	const handleVerdict = useCallback(
		(result: TestRunCaseResult) => {
			if (selected === null) {
				return;
			}
			setResult.mutate({ result, runCaseId: selected.runCase.id });
			if (shouldAutoAdvance(result)) {
				const next = nextRunCaseId(visibleCases, selected.runCase.id);
				if (next !== null) {
					onSelectRunCase(next);
				}
			}
		},
		[onSelectRunCase, selected, setResult, visibleCases]
	);

	const handleReset = useCallback(() => {
		if (selected !== null) {
			setResult.mutate({ result: "untested", runCaseId: selected.runCase.id });
		}
	}, [selected, setResult]);

	const handleCommentSave = useCallback(
		(comment: string | null) => {
			if (selected !== null) {
				saveComment.mutate({
					comment,
					result: selected.runCase.result,
					runCaseId: selected.runCase.id,
				});
			}
		},
		[saveComment, selected]
	);

	const handleSelect = useCallback(
		(nextId: string) => onSelectRunCase(nextId),
		[onSelectRunCase]
	);

	return { handleCommentSave, handleReset, handleSelect, handleVerdict };
}

export interface RunBulkHandlers {
	handleAssignToMe: () => void;
	handleBulkPass: () => void;
	handleRemoveCases: () => void;
	handleToggleAll: () => void;
}

export interface RunBulkHandlerOptions {
	checked: CheckedIds;
	mutations: RunCaseMutations;
	runId: string;
	selection: RunCaseSelection;
	user: PublicUser | null;
}

export function useRunBulkHandlers(
	options: RunBulkHandlerOptions
): RunBulkHandlers {
	const { runId, user } = options;
	const { assign, bulkSetResult, removeCases } = options.mutations;
	const { checkedIds, clear: clearChecked, setCheckedIds } = options.checked;
	const { visibleCases } = options.selection;

	const handleToggleAll = useCallback(() => {
		setCheckedIds((prev) =>
			prev.size === visibleCases.length && visibleCases.length > 0
				? new Set()
				: new Set(visibleCases.map((item) => item.runCase.id))
		);
	}, [setCheckedIds, visibleCases]);

	const handleBulkPass = useCallback(() => {
		bulkSetResult.mutate(
			{ result: "passed", runCaseIds: [...checkedIds], runId },
			{ onSuccess: clearChecked }
		);
	}, [bulkSetResult, checkedIds, clearChecked, runId]);

	const handleRemoveCases = useCallback(() => {
		removeCases.mutate(
			{ runCaseIds: [...checkedIds], runId },
			{ onSuccess: clearChecked }
		);
	}, [checkedIds, clearChecked, removeCases, runId]);

	const handleAssignToMe = useCallback(() => {
		if (user !== null) {
			assign.mutate(
				{ assigneeId: user.id, runCaseIds: [...checkedIds], runId },
				{ onSuccess: clearChecked }
			);
		}
	}, [assign, checkedIds, clearChecked, runId, user]);

	return {
		handleAssignToMe,
		handleBulkPass,
		handleRemoveCases,
		handleToggleAll,
	};
}
