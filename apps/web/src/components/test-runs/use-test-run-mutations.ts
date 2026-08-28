/**
 * 执行台的写操作。
 *
 * 全部只做「调 mutation → 成功后 invalidate」，**不在前端判断状态机**：
 * 「已完成的测试任务还能不能改」「打了结论还能不能撤销评审」这类判定，
 * 后端在写操作所在的事务里做（plan §4.2 点名禁止 TOCTOU），
 * 前端再抄一遍只会多出一份迟早对不上的规则。界面上的禁用只表达
 * `runPermissions()` 那三档粗粒度权限，被拒绝的写请求由全局
 * MutationCache 的错误 toast 兜底（错误文案已由后端写成中文）。
 */
import type { TestRunCaseResult } from "@automationstack/db/schema/test-runs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

/**
 * 刷新一切能显示这个测试任务的查询。
 *
 * 用整个 `orpc.testRuns` 缓存根而不是单条 `get`：一次打结论会同时改变
 * 详情、列表页的进度条、报告页的数字与变更历史，逐个列举迟早漏一处。
 * 附件列表在另一个 router 下，由 `use-attachment-upload.ts` 自己刷。
 */
export function useInvalidateTestRuns(): () => void {
	const queryClient = useQueryClient();
	return useCallback(() => {
		queryClient.invalidateQueries({ queryKey: orpc.testRuns.key() });
	}, [queryClient]);
}

/**
 * 单条打结论 / 回退结论。
 *
 * **成功时不弹 toast**：这是本页最高频的操作（快捷键连按），
 * 每按一次弹一条会把屏幕糊满，而结论本身在清单和右栏里都是立刻可见的。
 * 失败才需要说话，那条由全局错误 toast 负责。
 */
export function useSetRunCaseResult() {
	const invalidate = useInvalidateTestRuns();
	return useMutation(
		orpc.testRuns.setResult.mutationOptions({ onSuccess: invalidate })
	);
}

/** 只改说明、不动结论时用同一个接口：`result` 原样回传。 */
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

/**
 * 保存一条用例的分步判定。
 *
 * 与 `useSetRunCaseResult` 刻意相反，这里**成功要弹 toast**：那条是连按快捷键
 * 的高频操作，弹了会糊屏；这条是「判完一整屏再点一次」的低频操作，而且成功的
 * 那一刻本机草稿会被清掉，不说一声，用户没有任何办法确认刚才那一屏真的进库了。
 *
 * 失败时**什么都不做**（错误 toast 由全局 MutationCache 兜底）：草稿必须原样
 * 留着——它此刻是那一屏判定的唯一副本。
 */
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

/**
 * 提交报告：终态，不可逆（D15）。
 *
 * 重复提交不是错误——后端返回 `alreadySubmitted: true`（幂等），
 * 这时说「已提交」而不是「提交成功」，否则用户会以为自己刚刚锁死了一个
 * 其实几天前就被自动提交的测试任务。
 */
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

/** 打结论时一并携带的说明；`undefined` 表示不动原有说明。 */
export interface VerdictInput {
	comment?: string | null;
	result: TestRunCaseResult;
	runCaseId: string;
}
