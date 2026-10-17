import type { changeCaseStatusSchema } from "@automationstack/api/schemas/case";
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
import { orpc } from "@/utils/orpc";

export interface CaseStatusChangeRequest {
	caseId: string;
	from: CaseStatus;
	to: CaseStatus;
}

interface CaseListPage {
	items: TestCase[];
}

type StatusChangeInput = z.infer<typeof changeCaseStatusSchema>;

/** 提示中的「撤销」。撤销失败的原因由全局的失败提示显示。 */
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

function withStatus(
	page: CaseListPage | undefined,
	{ ids, status }: StatusChangeInput
): CaseListPage | undefined {
	if (page === undefined) {
		return page;
	}
	const changed = new Set(ids);
	return {
		...page,
		items: page.items.map((testCase) =>
			changed.has(testCase.id) ? { ...testCase, status } : testCase
		),
	};
}

/**
 * 只改用例状态。列表中的状态立刻更新，保存后重新载入用例。
 * 失败的原因由全局的失败提示显示，重新载入后列表恢复为服务端的状态。
 */
function useChangeStatusMutation() {
	const queryClient = useQueryClient();
	const invalidateCases = useInvalidateCases();
	return useMutation(
		orpc.cases.changeStatus.mutationOptions({
			meta: { failureAction: "修改用例状态" },
			onMutate: async (input: StatusChangeInput) => {
				const queryKey = orpc.cases.list.key();
				await queryClient.cancelQueries({ queryKey });
				queryClient.setQueriesData<CaseListPage>({ queryKey }, (page) =>
					withStatus(page, input)
				);
			},
			onSettled: invalidateCases,
		})
	);
}

/** 用例表格中改一条用例的状态。提示「已改为废弃」等，带「撤销」，撤销也记录一个新版本。 */
export function useCaseStatusChange(): (
	request: CaseStatusChangeRequest
) => Promise<void> {
	const { mutateAsync } = useChangeStatusMutation();

	const undo = useCallback(
		async ({ caseId, from }: CaseStatusChangeRequest) => {
			await mutateAsync({ ids: [caseId], status: from });
			toast.success(`已恢复为${STATUS_LABELS[from]}`);
		},
		[mutateAsync]
	);

	return useCallback(
		async (request: CaseStatusChangeRequest) => {
			try {
				await mutateAsync({ ids: [request.caseId], status: request.to });
			} catch {
				return;
			}
			toast.success(
				`已改为${STATUS_LABELS[request.to]}`,
				undoAction(() => undo(request))
			);
		},
		[mutateAsync, undo]
	);
}

interface ChangedCase {
	previousStatus: CaseStatus;
	testCase: { id: string };
	/** 状态没有变化时为 null：没有记录新版本，撤销时不动。 */
	version: { version: number } | null;
}

/** 撤销批量修改的请求：按原来的状态分组，每组一个请求。状态没有变化的用例不在其中。 */
function restoreInputs(changes: readonly ChangedCase[]): StatusChangeInput[] {
	const idsByStatus = new Map<CaseStatus, string[]>();
	for (const change of changes) {
		if (change.version === null) {
			continue;
		}
		const ids = idsByStatus.get(change.previousStatus) ?? [];
		ids.push(change.testCase.id);
		idsByStatus.set(change.previousStatus, ids);
	}
	return [...idsByStatus].map(([status, ids]) => ({ ids, status }));
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
 * 用例表格中批量改勾选用例的状态，一个请求完成（一个事务，要么都改，要么都不改）。
 * 提示修改结果，带「撤销」：撤销把每条用例恢复为它自己原来的状态，也记录新版本。
 * 撤销按原来的状态分组，每组一个请求（最多三个）。一组失败时停下，已恢复的组不回退，重新载入后列表显示实际的状态。
 * 一次最多 MAX_STATUS_CHANGE_CASES 条，由批量操作栏在请求前检查。
 * 返回是否修改成功。失败的原因由全局的失败提示显示。
 */
export function useCaseBatchStatusChange(): (
	ids: readonly string[],
	to: CaseStatus
) => Promise<boolean> {
	const { mutateAsync } = useChangeStatusMutation();

	const undo = useCallback(
		async (inputs: readonly StatusChangeInput[]) => {
			for (const input of inputs) {
				// biome-ignore lint/performance/noAwaitInLoops: 一组恢复成功后再恢复下一组，失败时停下
				await mutateAsync(input);
			}
			const count = inputs.reduce((sum, input) => sum + input.ids.length, 0);
			toast.success(`已恢复 ${count} 条用例原来的状态`);
		},
		[mutateAsync]
	);

	return useCallback(
		async (ids: readonly string[], to: CaseStatus) => {
			let changes: ChangedCase[];
			try {
				({ changes } = await mutateAsync({ ids: [...ids], status: to }));
			} catch {
				return false;
			}
			const restore = restoreInputs(changes);
			toast.success(
				batchMessage(changes, to),
				restore.length === 0 ? undefined : undoAction(() => undo(restore))
			);
			return true;
		},
		[mutateAsync, undo]
	);
}
