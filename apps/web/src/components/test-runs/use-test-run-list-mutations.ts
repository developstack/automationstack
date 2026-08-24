/**
 * 列表页的写操作：新建 / 改名 / 删除 / 从失败用例新建测试任务。
 *
 * 与 `use-test-run-mutations.ts`（执行台，W6）分开放：那一份全是「打结论」
 * 这类高频操作、成功时刻意不弹 toast；这一份是低频的增删改，每次都必须
 * 说一句话，否则对话框关掉之后用户不知道成没成。两边共用同一个
 * `useInvalidateTestRuns()`，缓存刷新口径只有一处。
 *
 * 错误一律不在这里处理：`utils/orpc.ts` 的全局 MutationCache 已经把
 * `error.message` 弹成 toast，而后端的错误文案本来就是写好的中文
 * （`empty-cases` → 「至少要选择一条用例」、已提交删除 → CONFLICT）。
 * 在这里再 catch 一次只会变成两条 toast。
 */
import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { useInvalidateTestRuns } from "@/components/test-runs/use-test-run-mutations";
import { orpc } from "@/utils/orpc";

/** 刷新缓存 + 报一声 + 关掉发起它的对话框。 */
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

export function useRemoveTestRun(onDone: () => void) {
	const settle = useSettle(onDone);
	return useMutation(
		orpc.testRuns.remove.mutationOptions({
			onSuccess: () => settle("测试任务已删除"),
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
