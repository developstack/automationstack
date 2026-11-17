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

interface AdoptedExpected {
	caseVersion: number;
	skippedAttachments: number;
	stepNumber: number;
}

function adoptedMessage(result: AdoptedExpected): string {
	const done = `第 ${result.stepNumber} 步的预期结果已改为实际结果，用例升到 v${result.caseVersion}`;
	if (result.skippedAttachments === 0) {
		return done;
	}
	return `${done}。${result.skippedAttachments} 个实际附件不是可用的图片，没有复制为预期截图`;
}

/** 设为预期结果：用例也改变了，所以刷新测试任务、用例、用例图片和脑图。 */
export function useAdoptActualAsExpected() {
	const queryClient = useQueryClient();
	return useMutation(
		orpc.testRuns.adoptActualAsExpected.mutationOptions({
			onSuccess: (result) => {
				for (const queryKey of [
					orpc.testRuns.key(),
					orpc.cases.key(),
					orpc.caseAttachments.key(),
					orpc.mindmap.key(),
				]) {
					queryClient.invalidateQueries({ queryKey });
				}
				toast.success(adoptedMessage(result));
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
