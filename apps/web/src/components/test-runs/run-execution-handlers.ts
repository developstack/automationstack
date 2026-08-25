/**
 * 执行台的写操作绑定：把 `use-test-run-mutations.ts` 里的 mutation 接到具体按钮上，
 * 并在这里、且只在这里，做「打完之后跳不跳」这一类**交互**决策。
 *
 * 状态机判定仍然不在前端做（理由见 `use-test-run-mutations.ts` 的文件注释），
 * 这里出现的分支全部只关乎光标停在哪、勾选要不要清空。
 *
 * 分成 mutations / verdict / bulk 三个 hook，是按触发路径切的：一组是右栏和
 * 快捷键（一次一条），一组是左栏工具条（一次一批）。三者在 `useRunExecution`
 * 里**必须按本文件的声明顺序相继调用**——hook 的调用顺序是 React 认领 state 的
 * 唯一依据，为了「读起来更顺」调换两行，等于把上一次渲染的 state 交给另一个 hook。
 */
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

/**
 * 五个 mutation 一次取齐。
 *
 * 合起来只是为了让页面那一层一眼看见「这一屏有五个写操作」，没有别的语义；
 * 内部顺序与它们从前在页面里逐行调用时完全一致，同样不能重排。
 */
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

/** 单条用例上的四个动作：打结论、打回未测、存说明、换一条。 */
export function useRunVerdictHandlers(
	options: RunVerdictHandlerOptions
): RunVerdictHandlers {
	const { onSelectRunCase } = options;
	const { saveComment, setResult } = options.mutations;
	const { selected, visibleCases } = options.selection;

	/**
	 * 打结论后的跳转规则（plan 012 D1）：通过 / 跳过自动跳到（筛选后的）下一条，
	 * 到末尾就停在原地；失败 / 阻塞留在本条——那两种结论要填说明 / 附件 / 缺陷，
	 * 跳走等于逼用户再点回来（与 handleReset 留在原地同理）。
	 */
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

	/** 打回未测：**不跳下一条**，因为这多半是发现刚才打错了，人要留在原地。 */
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

/** 勾选集上的四个动作。三个写操作成功后都清空勾选，避免对着旧集合再点一次。 */
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

	/*
	 * 只提供「指派给我 / 取消指派」，没有成员下拉：成员名单接口
	 * （`users.list`）是 adminProcedure，普通成员拉不动，做一个只有管理员
	 * 能用的下拉会让大多数人看到一个空列表。这条限制已写进交付报告。
	 */
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
