/**
 * 列表行尾的操作菜单：编辑 / 从失败用例创建重测任务 / 删除。
 *
 * 两条硬规则由这里挂上的三个菜单项落地（每项各自一个文件，
 * 见 test-run-row-edit-item / -retest-item / -delete-item）：
 * 1. **已提交的测试任务不可删除**（后端 CONFLICT）。菜单项禁用并把理由写成可见文字，
 *    而不是让人点了再被红字打回来——那等于把规则藏在失败里。
 * 2. **已提交的测试任务仍可开重测任务**。它是终态唯一的出口，跟着一起灰掉就没路走了。
 */
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
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { CreateFromFailedDialog } from "@/components/test-runs/create-from-failed-dialog";
import { isTestRunLocked } from "@/components/test-runs/test-run-rates";
import { TestRunRowDeleteItem } from "@/components/test-runs/test-run-row-delete-item";
import { TestRunRowEditItem } from "@/components/test-runs/test-run-row-edit-item";
import { TestRunRowRetestItem } from "@/components/test-runs/test-run-row-retest-item";
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

/** 带上任务名：读屏的按钮列表里，一排「测试任务操作」互相分辨不出来。 */
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
	const locked = isTestRunLocked(run.status);
	const noFailed = counts.failed === 0;

	const handleEdit = useCallback(() => onEdit(run.id), [onEdit, run.id]);
	const openDelete = useCallback(() => setDeleting(true), []);
	const closeDelete = useCallback(() => setDeleting(false), []);
	const openRetest = useCallback(() => setRetesting(true), []);
	const closeRetest = useCallback(() => setRetesting(false), []);

	return (
		<>
			<DropdownMenu>
				<RowActionsTrigger runName={run.name} />
				<DropdownMenuContent align="end">
					<TestRunRowEditItem locked={locked} onEdit={handleEdit} />
					<TestRunRowRetestItem noFailed={noFailed} onOpen={openRetest} />
					<TestRunRowDeleteItem locked={locked} onOpen={openDelete} />
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
