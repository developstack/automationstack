import type { TestRun } from "@automationstack/db/schema/test-runs";
import { Button } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";
import { useCallback } from "react";

import { StatusBadge } from "@/components/status/status-badge";
import {
	formatPassRate,
	type RunCounts,
	testRunProgress,
} from "@/components/test-runs/test-run-rates";
import {
	useMarkRunReviewed,
	useUnmarkRunReviewed,
} from "@/components/test-runs/use-test-run-mutations";

export interface RunExecutionHeaderProps {
	counts: RunCounts;
	projectId: string;
	run: TestRun;
}

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
			<StatusBadge kind="runStatus" value={run.status} />
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
