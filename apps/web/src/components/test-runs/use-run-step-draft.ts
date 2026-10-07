import type { CaseStep } from "@automationstack/db/schema/test-cases";
import type {
	RunCaseStepResult,
	TestRunStepResult,
} from "@automationstack/db/schema/test-runs";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import {
	clearRunStepDraft,
	readRunStepDraft,
	writeRunStepDraft,
} from "@/components/test-runs/run-step-draft";

const DRAFT_WRITE_DEBOUNCE_MS = 500;

export interface RunStepDraftState {
	comments: Record<string, string>;
	judged: Record<string, TestRunStepResult>;
}

function baselineOf(
	stepResults: readonly RunCaseStepResult[]
): RunStepDraftState {
	const comments: Record<string, string> = {};
	const judged: Record<string, TestRunStepResult> = {};
	for (const item of stepResults) {
		judged[item.stepId] = item.result;
		if (item.comment !== null) {
			comments[item.stepId] = item.comment;
		}
	}
	return { comments, judged };
}

export interface RunStepDraftOptions {
	caseVersion: number;
	runCaseId: string;
	stepResults: readonly RunCaseStepResult[];
	steps: readonly CaseStep[];
}

export interface RunStepDraftHandle {
	comments: Record<string, string>;
	dirty: boolean;
	judged: Record<string, TestRunStepResult>;
	markSaved: () => void;
	passAll: () => void;
	reset: () => void;
	setComment: (stepId: string, text: string) => void;
	setResult: (stepId: string, result: TestRunStepResult) => void;
	staleDiscarded: boolean;
}

function useDraftPersistence(input: {
	caseVersion: number;
	dirty: boolean;
	draft: RunStepDraftState;
	runCaseId: string;
}): void {
	const latest = useRef(input);
	latest.current = input;

	const flush = useCallback(() => {
		const { current } = latest;
		if (current.dirty) {
			writeRunStepDraft(current.runCaseId, {
				caseVersion: current.caseVersion,
				comments: current.draft.comments,
				judged: current.draft.judged,
			});
		}
	}, []);

	const fingerprint = JSON.stringify(input.draft);
	// biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint 就是「内容变没变」本身，effect 体里当然不会用到它；把它按提示删掉，计时器就再也不会因为用户又点了一步而重排，草稿只在挂载时写一次。
	useEffect(() => {
		const timer = window.setTimeout(flush, DRAFT_WRITE_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [fingerprint, flush]);

	useEffect(() => flush, [flush]);
}

type DraftActions = Pick<
	RunStepDraftHandle,
	"markSaved" | "passAll" | "reset" | "setComment" | "setResult"
>;

function useDraftEdits(input: {
	setDirty: Dispatch<SetStateAction<boolean>>;
	setDraft: Dispatch<SetStateAction<RunStepDraftState>>;
	steps: readonly CaseStep[];
}): Pick<DraftActions, "passAll" | "setComment" | "setResult"> {
	const { setDirty, setDraft, steps } = input;

	const setResult = useCallback(
		(stepId: string, result: TestRunStepResult) => {
			setDirty(true);
			setDraft((prev) => ({
				...prev,
				judged: { ...prev.judged, [stepId]: result },
			}));
		},
		[setDirty, setDraft]
	);

	const setComment = useCallback(
		(stepId: string, text: string) => {
			setDirty(true);
			setDraft((prev) => ({
				...prev,
				comments: { ...prev.comments, [stepId]: text },
			}));
		},
		[setDirty, setDraft]
	);

	const passAll = useCallback(() => {
		setDirty(true);
		setDraft((prev) => ({
			...prev,
			judged: Object.fromEntries(
				steps.map((step) => [step.id, "passed" as TestRunStepResult])
			),
		}));
	}, [setDirty, setDraft, steps]);

	return { passAll, setComment, setResult };
}

function useDraftExits(input: {
	runCaseId: string;
	setDirty: Dispatch<SetStateAction<boolean>>;
	setDraft: Dispatch<SetStateAction<RunStepDraftState>>;
	setStaleDiscarded: Dispatch<SetStateAction<boolean>>;
	stepResults: readonly RunCaseStepResult[];
}): Pick<DraftActions, "markSaved" | "reset"> {
	const { runCaseId, setDirty, setDraft, setStaleDiscarded, stepResults } =
		input;

	const markSaved = useCallback(() => {
		setDirty(false);
		setStaleDiscarded(false);
		clearRunStepDraft(runCaseId);
	}, [runCaseId, setDirty, setStaleDiscarded]);

	const reset = useCallback(() => {
		setDraft(baselineOf(stepResults));
		markSaved();
	}, [markSaved, setDraft, stepResults]);

	return { markSaved, reset };
}

export function useRunStepDraft(
	options: RunStepDraftOptions
): RunStepDraftHandle {
	const { caseVersion, runCaseId, stepResults, steps } = options;
	const [draft, setDraft] = useState<RunStepDraftState>(() =>
		baselineOf(stepResults)
	);
	const [dirty, setDirty] = useState(false);
	const [staleDiscarded, setStaleDiscarded] = useState(false);

	const dirtyRef = useRef(dirty);
	dirtyRef.current = dirty;

	useEffect(() => {
		if (!dirtyRef.current) {
			setDraft(baselineOf(stepResults));
		}
	}, [stepResults]);

	useEffect(() => {
		const found = readRunStepDraft(runCaseId, caseVersion);
		if (found.kind === "stale") {
			setStaleDiscarded(true);
			return;
		}
		if (found.kind === "ok") {
			setDraft({ comments: found.draft.comments, judged: found.draft.judged });
			setDirty(true);
		}
	}, [caseVersion, runCaseId]);

	useDraftPersistence({ caseVersion, dirty, draft, runCaseId });

	const edits = useDraftEdits({ setDirty, setDraft, steps });
	const exits = useDraftExits({
		runCaseId,
		setDirty,
		setDraft,
		setStaleDiscarded,
		stepResults,
	});

	return {
		...edits,
		...exits,
		comments: draft.comments,
		dirty,
		judged: draft.judged,
		staleDiscarded,
	};
}
