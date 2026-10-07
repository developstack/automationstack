import type { PublicUser } from "@automationstack/db/schema/users";
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useMemo,
	useState,
} from "react";

import {
	filterRunCases,
	type ModuleOption,
	moduleOptionsOf,
	type RunCaseDetail,
	type RunCaseFilter,
} from "@/components/test-runs/run-execution-meta";
import {
	countResults,
	type ResultCounts,
} from "@/components/test-runs/test-run-meta";

export interface CheckedIds {
	checkedIds: ReadonlySet<string>;
	clear: () => void;
	setCheckedIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
	toggle: (runCaseId: string) => void;
}

export function useCheckedIds(): CheckedIds {
	const [checkedIds, setCheckedIds] = useState<ReadonlySet<string>>(new Set());
	const toggle = useCallback((runCaseId: string) => {
		setCheckedIds((prev) => {
			const next = new Set(prev);
			if (next.has(runCaseId)) {
				next.delete(runCaseId);
			} else {
				next.add(runCaseId);
			}
			return next;
		});
	}, []);
	const clear = useCallback(() => setCheckedIds(new Set()), []);
	return { checkedIds, clear, setCheckedIds, toggle };
}

export interface RunCaseSelectionOptions {
	cases: readonly RunCaseDetail[];
	filter: RunCaseFilter;
	selectedRunCaseId: string | undefined;
	user: PublicUser | null;
}

export interface RunCaseSelection {
	counts: ResultCounts;
	moduleOptions: readonly ModuleOption[];
	selected: RunCaseDetail | null;
	selectedTestCaseId: string | null;
	visibleCases: readonly RunCaseDetail[];
}

export function useRunCaseSelection(
	options: RunCaseSelectionOptions
): RunCaseSelection {
	const { cases, filter, selectedRunCaseId, user } = options;
	const visibleCases = useMemo(
		() => filterRunCases(cases, filter, user?.id ?? null),
		[cases, filter, user?.id]
	);
	const moduleOptions = useMemo(() => moduleOptionsOf(cases), [cases]);
	const counts = useMemo(
		() => countResults(cases.map((item) => item.runCase.result)),
		[cases]
	);

	const selected =
		visibleCases.find((item) => item.runCase.id === selectedRunCaseId) ??
		visibleCases[0] ??
		null;

	return {
		counts,
		moduleOptions,
		selected,
		selectedTestCaseId: selected?.testCase.id ?? null,
		visibleCases,
	};
}
