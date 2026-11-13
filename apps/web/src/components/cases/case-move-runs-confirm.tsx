import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@automationstack/ui/components/alert-dialog";

import { useCallback } from "react";

import type {
	CaseMoveTarget,
	MoveImpactRun,
} from "@/components/cases/use-case-batch-move";
import { TruncatedText } from "@/components/interaction/truncated-text";
import { RUN_STATUS_LABELS } from "@/components/test-runs/test-run-meta";

/** 弹窗中最多列出的测试任务数。更多的测试任务只显示数量。 */
const MAX_LISTED_RUNS = 5;

/** 模块会跟着改的测试任务：名称和状态，最多列出 MAX_LISTED_RUNS 个。 */
function RunList({ runs }: { runs: readonly MoveImpactRun[] }) {
	const listed = runs.slice(0, MAX_LISTED_RUNS);
	const more = runs.length - listed.length;
	return (
		<ul className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
			{listed.map((run) => (
				<li className="flex min-w-0 items-center gap-2" key={run.id}>
					<TruncatedText className="flex-1" text={run.name} />
					<span className="shrink-0 text-muted-foreground text-xs">
						{RUN_STATUS_LABELS[run.status]}
					</span>
				</li>
			))}
			{more > 0 ? (
				<li className="text-muted-foreground text-xs">
					另有 {more} 个测试任务
				</li>
			) : null}
		</ul>
	);
}

export interface PendingRunsConfirm {
	module: CaseMoveTarget;
	runs: readonly MoveImpactRun[];
}

interface CaseMoveRunsConfirmProps {
	onCancel: () => void;
	onConfirm: () => void;
	pending: PendingRunsConfirm | null;
}

/**
 * 移动用例前的第二次确认：这些用例在进行中的测试任务中，确认后这些测试任务中的模块也一起改。
 * 已完成、已提交和已作废的测试任务不改（ADR 0009）。
 */
export function CaseMoveRunsConfirm({
	onCancel,
	onConfirm,
	pending,
}: CaseMoveRunsConfirmProps) {
	const runs = pending?.runs ?? [];
	const handleOpenChange = useCallback(
		(open: boolean) => {
			if (!open) {
				onCancel();
			}
		},
		[onCancel]
	);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={pending !== null}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						同时修改 <span className="numeric">{runs.length}</span>{" "}
						个进行中的测试任务？
					</AlertDialogTitle>
					<AlertDialogDescription>
						这些用例在下面的测试任务中。确认后，测试任务中这些用例的模块也改为「
						{pending?.module.name}
						」。已完成、已提交和已作废的测试任务不变。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<RunList runs={runs} />
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>确认移动</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
