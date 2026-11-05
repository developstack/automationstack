import type { changeCaseStatusInputSchema } from "@automationstack/api/schemas/case";
import type {
	CaseStatus,
	TestCase,
} from "@automationstack/db/schema/test-cases";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { STATUS_LABELS } from "@/components/cases/case-meta";
import { useInvalidateCases } from "@/components/cases/use-case-mutations";
import type { CaseBatchTarget } from "@/components/cases/use-case-selection";
import { orpc } from "@/utils/orpc";

export interface CaseStatusChangeRequest {
	caseId: string;
	from: CaseStatus;
	to: CaseStatus;
}

interface CaseListPage {
	items: TestCase[];
}

type StatusChangeInput = z.infer<typeof changeCaseStatusInputSchema>;

/** 提示中的「撤销」。撤销失败的原因（例如撤销已过期）由全局的失败提示显示。 */
function undoAction(undo: () => Promise<void>) {
	return {
		action: {
			label: "撤销",
			onClick: () => {
				undo().catch(() => undefined);
			},
		},
	};
}

/** 列表中的用例改为给出的状态，其他用例不变。 */
function withStatuses(
	page: CaseListPage | undefined,
	statusById: ReadonlyMap<string, CaseStatus>
): CaseListPage | undefined {
	if (page === undefined) {
		return page;
	}
	return {
		...page,
		items: page.items.map((testCase) => {
			const status = statusById.get(testCase.id);
			return status === undefined ? testCase : { ...testCase, status };
		}),
	};
}

/** 立刻更新列表中用例的状态。 */
function useSetListedStatuses() {
	const queryClient = useQueryClient();
	return useCallback(
		async (statusById: ReadonlyMap<string, CaseStatus>) => {
			const queryKey = orpc.cases.list.key();
			await queryClient.cancelQueries({ queryKey });
			queryClient.setQueriesData<CaseListPage>({ queryKey }, (page) =>
				withStatuses(page, statusById)
			);
		},
		[queryClient]
	);
}

/**
 * 只改用例状态。按 id 修改时列表中的状态立刻更新；按筛选条件修改时不知道哪些用例符合筛选，
 * 列表不立刻更新。保存后都重新载入用例。
 * 失败的原因由全局的失败提示显示，重新载入后列表恢复为服务端的状态。
 */
function useChangeStatusMutation() {
	const setListedStatuses = useSetListedStatuses();
	const invalidateCases = useInvalidateCases();
	return useMutation(
		orpc.cases.changeStatus.mutationOptions({
			meta: { failureAction: "修改用例状态" },
			onMutate: async (input: StatusChangeInput) => {
				if ("filter" in input) {
					return;
				}
				await setListedStatuses(
					new Map(input.ids.map((id) => [id, input.status]))
				);
			},
			onSettled: invalidateCases,
		})
	);
}

/**
 * 撤销一次状态修改：凭修改时返回的撤销凭证，由服务端恢复改过的用例（见 cases.undoStatusChange）。
 * 服务端跳过修改后又被改过的用例，所以列表在撤销成功后按返回的用例更新，再重新载入。
 */
function useUndoStatusMutation() {
	const setListedStatuses = useSetListedStatuses();
	const invalidateCases = useInvalidateCases();
	return useMutation(
		orpc.cases.undoStatusChange.mutationOptions({
			meta: { failureAction: "撤销修改用例状态" },
			onSettled: invalidateCases,
			onSuccess: ({ changes }) =>
				setListedStatuses(
					new Map(changes.map(({ testCase }) => [testCase.id, testCase.status]))
				),
		})
	);
}

/**
 * 用例表格中改一条用例的状态。提示「已改为废弃」等，带「撤销」，撤销也记录一个新版本。
 * 状态没有变化时没有撤销凭证，提示不带「撤销」。
 */
export function useCaseStatusChange(): (
	request: CaseStatusChangeRequest
) => Promise<void> {
	const { mutateAsync } = useChangeStatusMutation();
	const { mutateAsync: undoAsync } = useUndoStatusMutation();

	const undo = useCallback(
		async (token: string, from: CaseStatus) => {
			const { skippedIds } = await undoAsync({ token });
			if (skippedIds.length > 0) {
				toast.warning("用例在修改后又被改过，保留现在的状态");
				return;
			}
			toast.success(`已恢复为${STATUS_LABELS[from]}`);
		},
		[undoAsync]
	);

	return useCallback(
		async (request: CaseStatusChangeRequest) => {
			let undoToken: string | null;
			try {
				({ undoToken } = await mutateAsync({
					ids: [request.caseId],
					status: request.to,
				}));
			} catch {
				return;
			}
			toast.success(
				`已改为${STATUS_LABELS[request.to]}`,
				undoToken === null
					? undefined
					: undoAction(() => undo(undoToken, request.from))
			);
		},
		[mutateAsync, undo]
	);
}

interface ChangedCase {
	/** 状态没有变化时为 null：没有记录新版本。 */
	version: { version: number } | null;
}

function restoreMessage(restored: number, skipped: number): string {
	const message = `已恢复 ${restored} 条用例原来的状态`;
	return skipped > 0
		? `${message}，${skipped} 条在修改后又被改过，保留现在的状态`
		: message;
}

function batchMessage(changes: readonly ChangedCase[], to: CaseStatus): string {
	const label = STATUS_LABELS[to];
	const unchanged = changes.filter((change) => change.version === null).length;
	const message = `已将 ${changes.length} 条用例改为${label}`;
	return unchanged > 0
		? `${message}，其中 ${unchanged} 条原来就是${label}`
		: message;
}

/**
 * 用例表格中批量改用例的状态：勾选的用例，或全部符合筛选的用例（见 CaseBatchTarget）。
 * 一个请求完成（一个事务，要么都改，要么都不改）。按筛选条件修改时提示服务端实际修改的条数。
 * 提示修改结果，带「撤销」：撤销凭修改返回的撤销凭证，一个请求把每条用例恢复为它自己原来的状态，
 * 也记录新版本。修改后又被改过的用例保留现在的状态，提示中报告条数。
 * 一次最多的条数（MAX_BATCH_CASES、MAX_FILTER_BATCH_CASES）由批量操作栏在请求前检查。
 * 返回是否修改成功。失败的原因由全局的失败提示显示。
 */
export function useCaseBatchStatusChange(): (
	target: CaseBatchTarget,
	to: CaseStatus
) => Promise<boolean> {
	const { mutateAsync } = useChangeStatusMutation();
	const { mutateAsync: undoAsync } = useUndoStatusMutation();

	const undo = useCallback(
		async (token: string) => {
			const { changes, skippedIds } = await undoAsync({ token });
			const notify = skippedIds.length > 0 ? toast.warning : toast.success;
			notify(restoreMessage(changes.length, skippedIds.length));
		},
		[undoAsync]
	);

	return useCallback(
		async (target: CaseBatchTarget, to: CaseStatus) => {
			let result: { changes: ChangedCase[]; undoToken: string | null };
			try {
				result = await mutateAsync({ ...target, status: to });
			} catch {
				return false;
			}
			const { changes, undoToken } = result;
			toast.success(
				batchMessage(changes, to),
				undoToken === null ? undefined : undoAction(() => undo(undoToken))
			);
			return true;
		},
		[mutateAsync, undo]
	);
}
