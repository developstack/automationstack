import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

export function useInvalidateTestRuns(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.testRuns.key() });
	}, [queryClient]);
}

export function useSetRunCaseResult() {
	const invalidate = useInvalidateTestRuns();
	return useMutation(
		orpc.testRuns.setResult.mutationOptions({ onSuccess: invalidate })
	);
}

export function useSaveRunCaseComment() {
	const invalidate = useInvalidateTestRuns();
	return useMutation(
		orpc.testRuns.setResult.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("说明已保存");
			},
		})
	);
}

export function useSaveRunCaseStepResults() {
	const invalidate = useInvalidateTestRuns();
	return useMutation(
		orpc.testRuns.saveStepResults.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("分步判定已保存");
			},
		})
	);
}

export function useBulkSetRunCaseResult() {
	const invalidate = useInvalidateTestRuns();
	return useMutation(
		orpc.testRuns.bulkSetResult.mutationOptions({
			onSuccess: (_data, variables) => {
				invalidate();
				toast.success(`已批量标记 ${variables.runCaseIds.length} 条`);
			},
		})
	);
}

export function useAddRunCases(onAdded: () => void) {
	const invalidate = useInvalidateTestRuns();
	return useMutation(
		orpc.testRuns.addCases.mutationOptions({
			onSuccess: (_data, variables) => {
				invalidate();
				toast.success(`已追加 ${variables.caseIds.length} 条用例`);
				onAdded();
			},
		})
	);
}

export function useRemoveRunCases() {
	const invalidate = useInvalidateTestRuns();
	return useMutation(
		orpc.testRuns.removeCases.mutationOptions({
			onSuccess: (_data, variables) => {
				invalidate();
				toast.success(`已移出 ${variables.runCaseIds.length} 条用例`);
			},
		})
	);
}

export function useAssignRunCases() {
	const invalidate = useInvalidateTestRuns();
	return useMutation(
		orpc.testRuns.assign.mutationOptions({
			onSuccess: (_data, variables) => {
				invalidate();
				toast.success(
					variables.assigneeId === null ? "已取消指派" : "已更新指派"
				);
			},
		})
	);
}

export function useMarkRunReviewed() {
	const invalidate = useInvalidateTestRuns();
	return useMutation(
		orpc.testRuns.markReviewed.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("已标记评审完成，可以开始测试");
			},
		})
	);
}

export function useUnmarkRunReviewed() {
	const invalidate = useInvalidateTestRuns();
	return useMutation(
		orpc.testRuns.unmarkReviewed.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("已退回待评审");
			},
		})
	);
}

export function useSubmitTestRun() {
	const invalidate = useInvalidateTestRuns();
	return useMutation(
		orpc.testRuns.submit.mutationOptions({
			onSuccess: (data) => {
				invalidate();
				toast.success(
					data.alreadySubmitted ? "该报告此前已提交" : "报告已提交并锁定"
				);
			},
		})
	);
}

export interface VerdictInput {
	comment?: string | null;
	result: TestRunCaseResult;
	runCaseId: string;
}
