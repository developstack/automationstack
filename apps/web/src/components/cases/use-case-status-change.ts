import type {
	CaseStatus,
	TestCase,
} from "@automationstack/db/schema/test-cases";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

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

interface StatusChangeInput {
	ids: string[];
	status: CaseStatus;
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
			toast.success(`已改为${STATUS_LABELS[request.to]}`, {
				action: {
					label: "撤销",
					onClick: () => {
						undo(request).catch(() => undefined);
					},
				},
			});
		},
		[mutateAsync, undo]
	);
}
