/**
 * 「追加用例」抽屉的选中集、未保存守卫与提交
 * （从 `add-run-cases-sheet.tsx` 拆出来，见 eslint 的 50 行函数上限）。
 *
 * 整段前奏原样抽成一个 hook、在组件里按原顺序调用，而不是跟着 JSX 一起搬进
 * 子组件：抽屉内容是按 `open` 挂载卸载的，选中集跟着搬过去就会随内容一起没，
 * 而守卫恰恰要在关闭**之前**知道有没有勾过东西——挑了半天的一批用例不能被
 * 一次误点抹掉。留在 hook 里，持有它的仍然是 `AddRunCasesSheet` 这一个实例。
 */
import { useCallback, useState } from "react";

import { isTestRunDraftDirty } from "@/components/test-runs/test-run-draft";
import { useAddRunCases } from "@/components/test-runs/use-test-run-mutations";
import { useUnsavedCloseGuard } from "@/components/wide-sheet-shell";

/** 这个抽屉只挑用例，名称与说明恒为空，复用同一份草稿判定。 */
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
