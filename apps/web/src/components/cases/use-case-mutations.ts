import { isDefinedError } from "@orpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

function useInvalidateCases() {
	const queryClient = useQueryClient();
	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.cases.key() });
		queryClient.invalidateQueries({ queryKey: orpc.mindmap.key() });
	}, [queryClient]);
}

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

export interface CreateCaseHandlers {
	onCreated: (caseId: string) => void;
	onDuplicate?: () => void;
}

export function useCreateCase(handlers: CreateCaseHandlers) {
	const invalidateCases = useInvalidateCases();

	return useMutation(
		orpc.cases.create.mutationOptions({
			meta: { suppressErrorToast: true },
			onError: (error) => {
				if (isDefinedError(error) && error.code === "CONFLICT") {
					toast.error(error.message);
					invalidateCases();
					handlers.onDuplicate?.();
					return;
				}
				toast.error(error.message);
			},
			onSuccess: (result) => {
				toast.success("用例已创建");
				invalidateCases();
				handlers.onCreated(result.testCase.id);
			},
		})
	);
}

export function useRemoveCase(onRemoved: () => void) {
	const invalidateCases = useInvalidateCases();

	return useMutation(
		orpc.cases.remove.mutationOptions({
			meta: { failureAction: "删除用例" },
			onSuccess: () => {
				toast.success("用例已删除");
				invalidateCases();
				onRemoved();
			},
		})
	);
}

export { useInvalidateCases };
