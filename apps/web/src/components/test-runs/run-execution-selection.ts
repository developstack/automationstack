/**
 * 执行台左栏的派生量：勾选集、筛选后的清单、以及「当前落在哪一条」。
 *
 * 与 `run-execution-meta.ts` 的分工是刻意的：那边是纯函数（怎么筛、下一条是谁），
 * 能脱离 React 直接单测；这边只负责把那些纯函数接到 `useMemo` 上。所以本文件里
 * 不应该出现任何新的筛选口径——一旦出现，就说明它该写回 meta 里，否则它就成了
 * 一条测不到的规则。
 */
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

/** 勾选集：批量操作用。切换筛选不清空，理由同 `case-picker` 的跨筛选累积。 */
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
	/** URL 上那条；能不能落到实处由 `selected` 决定。 */
	selectedRunCaseId: string | undefined;
	user: PublicUser | null;
}

export interface RunCaseSelection {
	counts: ResultCounts;
	moduleOptions: readonly ModuleOption[];
	selected: RunCaseDetail | null;
	/**
	 * 上报 presence 用的**用例** id（`testCase.id`），不是 `runCase.id`。
	 *
	 * 两者不能混：协作头像按用例聚合，用例列表页和执行台看的是同一条用例，
	 * 传 runCase id 会让同一条用例在两个页面上被认成两条，头像各显示各的。
	 */
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

	/** 选中条：URL 上那条若被筛掉或已移出，退回可见列表的第一条。 */
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
