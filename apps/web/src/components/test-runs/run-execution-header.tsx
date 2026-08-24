/**
 * 执行台顶部：任务名、状态、进度、以及与状态机相关的那两个动作。
 *
 * **「已完成」不是只读态**（plan §2.2 / D12）：这里刻意不出现「重新打开」按钮，
 * 因为根本不需要——已完成的测试任务直接改结论即可，后端会在同一事务里把它退回
 * 「测试中」。放一个「重新打开」等于凭空造出一道用户必须先跨过的门槛。
 */
import type { TestRun } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";
import { useCallback } from "react";

import {
	formatPassRate,
	type RunCounts,
	testRunProgress,
} from "@/components/test-runs/test-run-rates";
import { TestRunStatusBadge } from "@/components/test-runs/test-run-status-badge";
import {
	useMarkRunReviewed,
	useUnmarkRunReviewed,
} from "@/components/test-runs/use-test-run-mutations";

export interface RunExecutionHeaderProps {
	counts: RunCounts;
	projectId: string;
	run: TestRun;
}

/** 待评审 ⇄ 待测试的那一对按钮。其余状态都不显示。 */
function ReviewActions({ run }: { run: TestRun }) {
	const markReviewed = useMarkRunReviewed();
	const unmarkReviewed = useUnmarkRunReviewed();
	const handleMark = useCallback(
		() => markReviewed.mutate({ runId: run.id }),
		[markReviewed, run.id]
	);
	const handleUnmark = useCallback(
		() => unmarkReviewed.mutate({ runId: run.id }),
		[unmarkReviewed, run.id]
	);

	if (run.status === "pending_review") {
		return (
			<Button
				aria-disabled={markReviewed.isPending || undefined}
				onClick={markReviewed.isPending ? undefined : handleMark}
				type="button"
			>
				标记评审完成
			</Button>
		);
	}
	if (run.status === "ready") {
		// 只有「还没人测过」的测试任务能退回评审，后端会拒绝已有结论的那些；
		// 这里跟着只在 ready 上给入口，避免摆一个必然失败的按钮。
		return (
			<Button
				aria-disabled={unmarkReviewed.isPending || undefined}
				onClick={unmarkReviewed.isPending ? undefined : handleUnmark}
				type="button"
				variant="outline"
			>
				退回待评审
			</Button>
		);
	}
	return null;
}

export function RunExecutionHeader({
	counts,
	projectId,
	run,
}: RunExecutionHeaderProps) {
	const progress = testRunProgress(counts);

	return (
		<div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
			<h2 className="min-w-0 truncate font-medium">{run.name}</h2>
			<TestRunStatusBadge status={run.status} />
			{/* 两个率的口径完全不同，所以并排列出并各自标名，不合成一个数字 */}
			<span className="text-muted-foreground text-sm tabular-nums">
				完成 {progress.done}/{progress.total} · 通过率 {formatPassRate(counts)}
			</span>
			<div className="ml-auto flex items-center gap-2">
				<ReviewActions run={run} />
				<Button
					render={
						<Link
							params={{ projectId, runId: run.id }}
							to="/projects/$projectId/test-runs/$runId/report"
						/>
					}
					variant="outline"
				>
					<FileTextIcon aria-hidden="true" data-icon="inline-start" />
					查看报告
				</Button>
			</div>
		</div>
	);
}
