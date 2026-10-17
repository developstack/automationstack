import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { useInvalidateCases } from "@/components/cases/use-case-mutations";
import { orpc } from "@/utils/orpc";

interface BatchRemoveResult {
	deleted: readonly unknown[];
	missingIds: readonly string[];
	skipped: readonly unknown[];
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
 * 用例表格中批量删除勾选的用例，一个请求完成。被测试任务用到的用例由服务端跳过，
 * 提示删除和跳过的条数；有跳过的用例时用警告提示。完成后重新载入用例列表和脑图。
 * 一次最多 MAX_BATCH_CASES 条，由批量操作栏在请求前检查。
 * 返回是否删除成功。失败的原因由全局的失败提示显示。
 */
export function useCaseBatchRemove(): (
	ids: readonly string[]
) => Promise<boolean> {
	const invalidateCases = useInvalidateCases();
	const { mutateAsync } = useMutation(
		orpc.cases.removeMany.mutationOptions({
			meta: { failureAction: "删除用例" },
			onSettled: invalidateCases,
		})
	);

	return useCallback(
		async (ids: readonly string[]) => {
			const result = await mutateAsync({ ids: [...ids] }).catch(() => null);
			if (result === null) {
				return false;
			}
			const notify = result.skipped.length > 0 ? toast.warning : toast.success;
			notify(batchRemoveMessage(result));
			return true;
		},
		[mutateAsync]
	);
}
