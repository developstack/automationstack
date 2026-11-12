import type { TestRunStatus } from "@automationstack/db/schema/test-runs";
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { useInvalidateCases } from "@/components/cases/use-case-mutations";
import type { CaseBatchTarget } from "@/components/cases/use-case-selection";
import { orpc } from "@/utils/orpc";

/** 移动的目标模块。名称用于结果提示。 */
export interface CaseMoveTarget {
	id: string;
	name: string;
}

/** 移动时模块会跟着改的测试任务（待评审、待测试、测试中）。 */
export interface MoveImpactRun {
	id: string;
	name: string;
	status: TestRunStatus;
}

interface BatchMoveResult {
	missingIds: readonly string[];
	moved: readonly unknown[];
	syncedRunIds: readonly string[];
	unchanged: readonly unknown[];
}

/** 批量移动的结果提示。已在目标模块中的用例和不存在的用例单独说明，不算作移动。 */
export function batchMoveMessage(
	{ missingIds, moved, syncedRunIds, unchanged }: BatchMoveResult,
	moduleName: string
): string {
	const parts = [`已移动 ${moved.length} 条用例到「${moduleName}」`];
	if (unchanged.length > 0) {
		parts.push(`${unchanged.length} 条已在这个模块中`);
	}
	if (missingIds.length > 0) {
		parts.push(`另有 ${missingIds.length} 条已不存在`);
	}
	if (syncedRunIds.length > 0) {
		parts.push(`${syncedRunIds.length} 个进行中的测试任务已同步修改`);
	}
	return parts.join("，");
}

/**
 * 用例表格中批量移动用例到一个模块：勾选的用例，或全部符合筛选的用例（见 CaseBatchTarget）。
 * 一个请求完成，提示服务端实际移动的条数，完成后重新载入用例列表和脑图。
 * 返回是否移动成功。失败的原因由全局的失败提示显示。
 */
export function useCaseBatchMove(): (
	target: CaseBatchTarget,
	module: CaseMoveTarget
) => Promise<boolean> {
	const invalidateCases = useInvalidateCases();
	const { mutateAsync } = useMutation(
		orpc.cases.moveMany.mutationOptions({
			meta: { failureAction: "移动用例" },
			onSettled: invalidateCases,
		})
	);

	return useCallback(
		async (target: CaseBatchTarget, module: CaseMoveTarget) => {
			const result = await mutateAsync({
				...target,
				moduleId: module.id,
			}).catch(() => null);
			if (result === null) {
				return false;
			}
			toast.success(batchMoveMessage(result, module.name));
			return true;
		},
		[mutateAsync]
	);
}

/**
 * 移动前查出模块会跟着改的测试任务，用于确认弹窗。
 * 返回 null 表示查询失败，失败的原因由全局的失败提示显示。
 */
export function useCaseMoveImpact(): (
	target: CaseBatchTarget,
	moduleId: string
) => Promise<readonly MoveImpactRun[] | null> {
	const { mutateAsync } = useMutation(
		orpc.cases.moveImpact.mutationOptions({
			meta: { failureAction: "检查测试任务" },
		})
	);
	return useCallback(
		async (target: CaseBatchTarget, moduleId: string) => {
			const result = await mutateAsync({ ...target, moduleId }).catch(
				() => null
			);
			return result === null ? null : result.runs;
		},
		[mutateAsync]
	);
}
