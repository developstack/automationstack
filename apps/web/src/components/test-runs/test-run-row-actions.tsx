import type { TestRunListItem } from "@automationstack/db/repositories/test-runs-repository";
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
import { Button } from "@automationstack/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { CreateFromFailedDialog } from "@/components/test-runs/create-from-failed-dialog";
import { isTestRunLocked } from "@/components/test-runs/test-run-rates";
import { useRemoveTestRun } from "@/components/test-runs/use-test-run-list-mutations";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface DeleteRunDialogProps {
	onClose: () => void;
	open: boolean;
	runId: string;
	runName: string;
}

function DeleteRunDialog({
	onClose,
	open,
	runId,
	runName,
}: DeleteRunDialogProps) {
	const remove = useRemoveTestRun(onClose);
	const handleOpenChange = useCloseOnDismiss(onClose);
	const handleConfirm = useCallback(() => {
		remove.mutate({ runId });
	}, [remove, runId]);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>删除测试任务「{runName}」？</AlertDialogTitle>
					<AlertDialogDescription>
						测试任务里已记录的结论、说明与附件会一并删除，且不可恢复。用例本身不受影响。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction
						disabled={remove.isPending}
						onClick={handleConfirm}
						variant="destructive"
					>
						删除
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function RowActionsTrigger({ runName }: { runName: string }) {
	return (
		<DropdownMenuTrigger
			render={
				<Button
					aria-label={`测试任务「${runName}」操作`}
					size="icon-xs"
					variant="ghost"
				>
					<MoreHorizontalIcon />
				</Button>
			}
		/>
	);
}

interface TestRunRowActionsProps {
	item: TestRunListItem;
	onEdit: (runId: string) => void;
}

export function TestRunRowActions({ item, onEdit }: TestRunRowActionsProps) {
	const { counts, run } = item;
	const [deleting, setDeleting] = useState(false);
	const [retesting, setRetesting] = useState(false);
	// 不能用的操作不放进菜单。已提交的测试任务不能编辑和删除。
	const locked = isTestRunLocked(run.status);
	const canRetest = counts.failed > 0;

	const handleEdit = useCallback(() => onEdit(run.id), [onEdit, run.id]);
	const openDelete = useCallback(() => setDeleting(true), []);
	const closeDelete = useCallback(() => setDeleting(false), []);
	const openRetest = useCallback(() => setRetesting(true), []);
	const closeRetest = useCallback(() => setRetesting(false), []);

	// 一项都不能用时，不显示「更多操作」按钮。
	if (locked && !canRetest) {
		return null;
	}

	return (
		<>
			<DropdownMenu>
				<RowActionsTrigger runName={run.name} />
				<DropdownMenuContent align="end">
					{locked ? null : (
						<DropdownMenuItem onClick={handleEdit}>编辑</DropdownMenuItem>
					)}
					{canRetest ? (
						<DropdownMenuItem onClick={openRetest}>
							从失败用例创建
						</DropdownMenuItem>
					) : null}
					{locked ? null : (
						<DropdownMenuItem onClick={openDelete} variant="destructive">
							删除
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			<DeleteRunDialog
				onClose={closeDelete}
				open={deleting}
				runId={run.id}
				runName={run.name}
			/>
			<CreateFromFailedDialog
				failedCount={counts.failed}
				onClose={closeRetest}
				open={retesting}
				sourceName={run.name}
				sourceRunId={run.id}
			/>
		</>
	);
}
