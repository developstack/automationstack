import { canVoidTestRun } from "@automationstack/api/lib/test-run-access";
import { isTestRunVoidable } from "@automationstack/db/repositories/test-run-status-core";
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
import { useCallback, useState } from "react";

import { CreateFromFailedDialog } from "@/components/test-runs/create-from-failed-dialog";
import { isTestRunLocked } from "@/components/test-runs/test-run-rates";
import { TestRunRowActionsMenu } from "@/components/test-runs/test-run-row-actions-menu";
import { useRunViewer } from "@/components/test-runs/use-run-viewer";
import { useRemoveTestRun } from "@/components/test-runs/use-test-run-list-mutations";
import { VoidRunDialog } from "@/components/test-runs/void-run-dialog";
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

function useDialogToggle(): [boolean, () => void, () => void] {
	const [open, setOpen] = useState(false);
	const show = useCallback(() => setOpen(true), []);
	const hide = useCallback(() => setOpen(false), []);
	return [open, show, hide];
}

interface TestRunRowActionsProps {
	item: TestRunListItem;
	onEdit: (runId: string) => void;
}

export function TestRunRowActions({ item, onEdit }: TestRunRowActionsProps) {
	const { counts, run } = item;
	const [deleting, openDelete, closeDelete] = useDialogToggle();
	const [retesting, openRetest, closeRetest] = useDialogToggle();
	const [voiding, openVoid, closeVoid] = useDialogToggle();
	const viewer = useRunViewer(run.projectId);
	// 不能用的操作不放进菜单。已提交和已作废的测试任务不能编辑和删除。
	const locked = isTestRunLocked(run.status);
	const canRetest = counts.failed > 0;
	// 与服务端用同一条规则：状态允许，并且是创建者、项目 owner 或平台管理员。
	const canVoid =
		viewer !== null &&
		isTestRunVoidable(run.status) &&
		canVoidTestRun(viewer, run.createdBy);
	const handleEdit = useCallback(() => onEdit(run.id), [onEdit, run.id]);

	// 一项都不能用时，不显示「更多操作」按钮。
	if (locked && !canRetest) {
		return null;
	}

	return (
		<>
			<TestRunRowActionsMenu
				canEdit={!locked}
				canRetest={canRetest}
				canVoid={canVoid}
				onDelete={openDelete}
				onEdit={handleEdit}
				onRetest={openRetest}
				onVoid={openVoid}
				runName={run.name}
			/>
			<DeleteRunDialog
				onClose={closeDelete}
				open={deleting}
				runId={run.id}
				runName={run.name}
			/>
			<VoidRunDialog
				onClose={closeVoid}
				open={voiding}
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
