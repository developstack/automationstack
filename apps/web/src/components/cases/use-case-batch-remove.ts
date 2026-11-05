import { MAX_BATCH_CASES } from "@automationstack/api/schemas/case";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { useInvalidateCases } from "@/components/cases/use-case-mutations";
import type { CaseBatchTarget } from "@/components/cases/use-case-selection";
import { useCaseBatchStatusChange } from "@/components/cases/use-case-status-change";
import { orpc } from "@/utils/orpc";

interface BatchRemoveResult {
	deleted: readonly unknown[];
	missingIds: readonly string[];
	skipped: readonly { id: string }[];
}

/** 批量删除的结果提示。不存在的用例（已被别人删除）单独说明，不算作删除。 */
function batchRemoveMessage({
	deleted,
	missingIds,
	skipped,
}: BatchRemoveResult): string {
	const message =
		skipped.length > 0
			? `已删除 ${deleted.length} 条，${skipped.length} 条被测试任务用到，已跳过，可改为废弃`
			: `已删除 ${deleted.length} 条用例`;
	return missingIds.length > 0
		? `${message}，另有 ${missingIds.length} 条已不存在`
		: message;
}

/**
 * 「改为废弃」修改的用例：跳过的用例。跳过的用例不超过 MAX_BATCH_CASES 条时按 id 修改。
 * 超过时只可能是按筛选条件删除的（勾选的用例最多 MAX_BATCH_CASES 条），按 id 不能一次修改，
 * 所以按删除时的筛选条件修改：删除后还符合筛选的用例就是跳过的用例
 * （除非这期间别人新建或修改了符合筛选的用例）。
 */
function skippedCasesTarget(
	target: CaseBatchTarget,
	skippedIds: string[]
): CaseBatchTarget {
	if (skippedIds.length <= MAX_BATCH_CASES) {
		return { ids: skippedIds };
	}
	return target;
}

/**
 * 用例表格中批量删除用例：勾选的用例，或全部符合筛选的用例（见 CaseBatchTarget）。
 * 一个请求完成。被测试任务用到的用例由服务端跳过，提示服务端实际删除和跳过的条数；
 * 有跳过的用例时用警告提示，带「改为废弃」：用批量改状态（useCaseBatchStatusChange）把跳过的用例
 * 改为废弃，提示修改结果并可以撤销。权限与删除相同（项目里任何成员都可以），删除成功就可以改状态，
 * 所以只在没有跳过的用例时不带「改为废弃」。完成后重新载入用例列表和脑图。
 * 一次最多的条数（MAX_BATCH_CASES、MAX_FILTER_BATCH_CASES）由批量操作栏在请求前检查。
 * 返回是否删除成功。失败的原因由全局的失败提示显示。
 */
export function useCaseBatchRemove(): (
	target: CaseBatchTarget
) => Promise<boolean> {
	const invalidateCases = useInvalidateCases();
	const changeStatus = useCaseBatchStatusChange();
	const { mutateAsync } = useMutation(
		orpc.cases.removeMany.mutationOptions({
			meta: { failureAction: "删除用例" },
			onSettled: invalidateCases,
		})
	);

	return useCallback(
		async (target: CaseBatchTarget) => {
			const result = await mutateAsync(target).catch(() => null);
			if (result === null) {
				return false;
			}
			const message = batchRemoveMessage(result);
			if (result.skipped.length === 0) {
				toast.success(message);
				return true;
			}
			const deprecateTarget = skippedCasesTarget(
				target,
				result.skipped.map((testCase) => testCase.id)
			);
			toast.warning(message, {
				action: {
					label: "改为废弃",
					onClick: () => {
						changeStatus(deprecateTarget, "deprecated").catch(() => undefined);
					},
				},
			});
			return true;
		},
		[changeStatus, mutateAsync]
	);
}
