/**
 * 测试任务执行台（plan §7.3）。
 *
 * 左边用例清单、右边用例内容 + 结论区，选中哪条只改 URL 的 `runCaseId`，
 * 不换页——这样刷新、后退、把链接发给同事都能停在同一条上。
 *
 * 权限只有三档，全部由 `runPermissions()` 从状态推出来，本文件不再二次判断：
 * `pending_review` 能增删用例但不能打结论；`ready` / `in_progress` /
 * **`completed`** 完全相同（已完成**不是**只读，改结论、回退、追加一律直接允许，
 * 不加二次确认）；`submitted` 全只读。
 *
 * 这一屏原本是一个 176 行的函数，现在只剩「路由参数 → 状态 → 布局」这一条线，
 * 实现分在四处，每一处都能单独读完：
 * - hook 顺序与页面状态 → `run-execution-state.ts`
 * - 可见清单、勾选集、当前选中条 → `run-execution-selection.ts`
 * - 写操作与「打完跳不跳」→ `run-execution-handlers.ts`
 * - 骨架与两栏 JSX → `run-execution-layout.tsx`
 */
import { RunExecutionLayout } from "@/components/test-runs/run-execution-layout";
import {
	type RunExecutionOptions,
	useRunExecution,
} from "@/components/test-runs/run-execution-state";

export interface RunExecutionViewProps extends RunExecutionOptions {
	projectId: string;
}

export function RunExecutionView(props: RunExecutionViewProps) {
	const state = useRunExecution(props);
	return <RunExecutionLayout {...state} projectId={props.projectId} />;
}
