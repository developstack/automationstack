import type { PublicUser } from "@automationstack/db/schema/users";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useState,
} from "react";

import { useSession } from "@/components/auth/use-session";
import {
	type RunBulkHandlers,
	type RunVerdictHandlers,
	useRunBulkHandlers,
	useRunCaseMutations,
	useRunVerdictHandlers,
} from "@/components/test-runs/run-execution-handlers";
import {
	DEFAULT_RUN_CASE_FILTER,
	type RunCaseDetail,
	type RunCaseFilter,
	type TestRunDetailView,
} from "@/components/test-runs/run-execution-meta";
import {
	type CheckedIds,
	type RunCaseSelection,
	useCheckedIds,
	useRunCaseSelection,
} from "@/components/test-runs/run-execution-selection";
import {
	type RunPermissions,
	runPermissions,
} from "@/components/test-runs/test-run-meta";
import { useAttachmentStorageStatus } from "@/components/test-runs/use-attachment-upload";
import { useCasePresence } from "@/realtime/use-editing";
import { orpc } from "@/utils/orpc";

export interface RunAttachmentStorage {
	markUnavailable: () => void;
	unavailable: boolean;
}

export function useRunAttachmentStorage(): RunAttachmentStorage {
	const storageStatusQuery = useAttachmentStorageStatus();
	const [storageFailed, setStorageFailed] = useState(false);
	const markUnavailable = useCallback(() => setStorageFailed(true), []);
	return {
		markUnavailable,
		unavailable: storageFailed || storageStatusQuery.data?.configured === false,
	};
}

export interface RunExecutionData {
	cases: readonly RunCaseDetail[];
	filter: RunCaseFilter;
	permissions: RunPermissions;
	run: TestRunDetailView["run"];
	setFilter: Dispatch<SetStateAction<RunCaseFilter>>;
	submittedByName: TestRunDetailView["submittedByName"];
	user: PublicUser | null;
}

export function useRunExecutionData(runId: string): RunExecutionData {
	const detailQuery = useSuspenseQuery(
		orpc.testRuns.get.queryOptions({ input: { runId } })
	);
	const { cases, run, submittedByName } = detailQuery.data;
	const { user } = useSession();
	const [filter, setFilter] = useState<RunCaseFilter>(DEFAULT_RUN_CASE_FILTER);
	return {
		cases,
		filter,
		permissions: runPermissions(run.status),
		run,
		setFilter,
		submittedByName,
		user,
	};
}

export interface RunExecutionOptions {
	onSelectRunCase: (runCaseId: string | undefined) => void;
	runId: string;
	selectedRunCaseId: string | undefined;
}

export interface RunExecutionState {
	addOpen: boolean;
	bulk: RunBulkHandlers;
	checked: CheckedIds;
	data: RunExecutionData;
	onCloseAdd: () => void;
	onOpenAdd: () => void;
	selection: RunCaseSelection;
	storage: RunAttachmentStorage;
	verdict: RunVerdictHandlers;
}

export function useRunExecution(
	options: RunExecutionOptions
): RunExecutionState {
	const { onSelectRunCase, runId, selectedRunCaseId } = options;
	const data = useRunExecutionData(runId);
	const [addOpen, setAddOpen] = useState(false);
	const storage = useRunAttachmentStorage();
	const checked = useCheckedIds();
	const selection = useRunCaseSelection({
		cases: data.cases,
		filter: data.filter,
		selectedRunCaseId,
		user: data.user,
	});

	useCasePresence(selection.selectedTestCaseId, false);

	const mutations = useRunCaseMutations();
	const verdict = useRunVerdictHandlers({
		mutations,
		onSelectRunCase,
		selection,
	});
	const bulk = useRunBulkHandlers({
		checked,
		mutations,
		runId,
		selection,
		user: data.user,
	});
	const openAdd = useCallback(() => setAddOpen(true), []);
	const closeAdd = useCallback(() => setAddOpen(false), []);

	return {
		addOpen,
		bulk,
		checked,
		data,
		onCloseAdd: closeAdd,
		onOpenAdd: openAdd,
		selection,
		storage,
		verdict,
	};
}
