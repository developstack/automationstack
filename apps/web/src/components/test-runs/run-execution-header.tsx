import type { TestRun } from "@automationstack/db/schema/test-runs";
import { Button, buttonVariants } from "@automationstack/ui/components/button";
import { Link } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";
import { useCallback } from "react";

import { PageHeader } from "@/components/layout/page-header";
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

export const RUN_EXECUTION_HEADER_CLASS = "px-4 pt-4 pb-3";

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
		<PageHeader
			actions={
				<>
					<ReviewActions run={run} />
					<Link
						className={buttonVariants({ variant: "outline" })}
						params={{ projectId, runId: run.id }}
						to="/projects/$projectId/test-runs/$runId/report"
					>
						<FileTextIcon aria-hidden="true" data-icon="inline-start" />
						查看报告
					</Link>
				</>
			}
			badge={<StatusBadge kind="runStatus" value={run.status} />}
			className={RUN_EXECUTION_HEADER_CLASS}
			summary={
				<span className="tabular-nums">
					完成 {progress.done}/{progress.total} · 通过率{" "}
					{formatPassRate(counts)}
				</span>
			}
			title={run.name}
		/>
	);
}
