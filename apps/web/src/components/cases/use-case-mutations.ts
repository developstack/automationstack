/**
 * Case mutations with the optimistic-lock semantics of `cases.update`.
 *
 * Every save carries `expectedVersion` (the `currentVersion` returned by
 * `cases.get`). A typed CONFLICT error means somebody else saved first, so we
 * render a dedicated toast and refetch the case instead of the generic error
 * toast installed on the MutationCache (`meta.suppressErrorToast`).
 */
import { isDefinedError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

/**
 * Re-fetches everything that can show a case: the list, the row and versions,
 * 外加脑图——脑图是同一批用例的另一种投影，漏掉它会让用户在列表里改完步骤、
 * 切到脑图还看到旧内容。
 */
function useInvalidateCases() {
	const queryClient = useQueryClient();
	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.cases.key() });
		queryClient.invalidateQueries({ queryKey: orpc.mindmap.key() });
	}, [queryClient]);
}

/** 乐观锁冲突的补救信息，渲染成详情面板内的常驻提示。 */
export interface CaseSaveConflict {
	currentVersion: number;
	lastModifiedBy: string;
}

const UNKNOWN_EDITOR = "他人";

export function useUpdateCase(onSaved: () => void) {
	const invalidateCases = useInvalidateCases();
	const [conflict, setConflict] = useState<CaseSaveConflict | null>(null);

	const mutation = useMutation(
		orpc.cases.update.mutationOptions({
			meta: { suppressErrorToast: true },
			onError: (error) => {
				if (isDefinedError(error) && error.code === "CONFLICT") {
					// 冲突的补救说明必须能慢慢读、能照着重做编辑，toast 会自己消失，
					// 所以详情写进常驻 alert，toast 只留一句「出事了」。
					setConflict({
						currentVersion: error.data.currentVersion,
						lastModifiedBy: error.data.lastModifiedBy ?? UNKNOWN_EDITOR,
					});
					toast.error("保存冲突：用例已被他人修改");
					invalidateCases();
					return;
				}
				toast.error(error.message);
			},
			// `version === null` 表示服务端判定内容没变、没有建新版本。
			// 照说「已保存」会让用户以为版本历史里多了一条，实际并没有。
			onSuccess: (result) => {
				setConflict(null);
				if (result.version === null) {
					toast.info("内容没有变化，未生成新版本");
				} else {
					toast.success("用例已保存");
				}
				invalidateCases();
				onSaved();
			},
		})
	);

	const clearConflict = useCallback(() => setConflict(null), []);

	return { clearConflict, conflict, mutation };
}

export function useCreateCase(onCreated: (caseId: string) => void) {
	const invalidateCases = useInvalidateCases();

	return useMutation(
		orpc.cases.create.mutationOptions({
			onSuccess: (result) => {
				toast.success("用例已创建");
				invalidateCases();
				onCreated(result.testCase.id);
			},
		})
	);
}

export function useRemoveCase(onRemoved: () => void) {
	const invalidateCases = useInvalidateCases();

	return useMutation(
		orpc.cases.remove.mutationOptions({
			onSuccess: () => {
				toast.success("用例已删除");
				invalidateCases();
				onRemoved();
			},
		})
	);
}

export { useInvalidateCases };
