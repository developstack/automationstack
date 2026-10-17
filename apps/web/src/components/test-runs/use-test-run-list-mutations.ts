import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { useInvalidateTestRuns } from "@/components/test-runs/use-test-run-mutations";
import { orpc } from "@/utils/orpc";

function useSettle(onDone: () => void) {
	const invalidate = useInvalidateTestRuns();
	return useCallback(
		(message: string) => {
			invalidate();
			toast.success(message);
			onDone();
		},
		[invalidate, onDone]
	);
}

export function useCreateTestRun(onDone: () => void) {
	const settle = useSettle(onDone);
	return useMutation(
		orpc.testRuns.create.mutationOptions({
			onSuccess: () => settle("测试任务已创建"),
		})
	);
}

export function useUpdateTestRun(onDone: () => void) {
	const settle = useSettle(onDone);
	return useMutation(
		orpc.testRuns.update.mutationOptions({
			onSuccess: () => settle("测试任务已更新"),
		})
	);
}

export function useVoidTestRun(onDone: () => void) {
	const settle = useSettle(onDone);
	return useMutation(
		orpc.testRuns.void.mutationOptions({
			onSuccess: () => settle("测试任务已作废"),
		})
	);
}

export function useCreateTestRunFromFailed(onDone: () => void) {
	const settle = useSettle(onDone);
	return useMutation(
		orpc.testRuns.createFromFailed.mutationOptions({
			onSuccess: () => settle("重测任务已创建"),
		})
	);
}
