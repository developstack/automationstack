/**
 * 列表行尾的操作菜单：编辑 / 从失败用例创建重测任务 / 删除。
 *
 * 两条硬规则在这里落地：
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
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@automationstack/ui/components/dropdown-menu";
import { MoreHorizontalIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { CreateFromFailedDialog } from "@/components/test-runs/create-from-failed-dialog";
import {
	isTestRunLocked,
	TEST_RUN_LOCKED_DELETE_HINT,
} from "@/components/test-runs/test-run-rates";
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

/**
 * 禁用的菜单项：动作名 + 一句可见的理由。
 *
 * 三个动作的禁用态长得一模一样，所以只写一份。理由做成菜单项里的**可见文字**，
 * 而不是 title 或者干脆只留一个灰按钮：title 在触屏和键盘上都出不来，
 * 而「为什么点不动」往往正是用户此刻唯一需要知道的事。
 */
function DisabledItem({ label, reason }: { label: string; reason: string }) {
	return (
		<DropdownMenuItem disabled={true}>
			{label}
			<span className="ml-auto pl-4 text-muted-foreground text-xs">
				{reason}
			</span>
		</DropdownMenuItem>
	);
}

/** 规则 1 的一半：已提交的测试任务不可修改。 */
function EditItem({ locked, onEdit }: { locked: boolean; onEdit: () => void }) {
	if (locked) {
		return <DisabledItem label="编辑" reason="已提交后不可修改" />;
	}
	return <DropdownMenuItem onClick={onEdit}>编辑</DropdownMenuItem>;
}

/**
 * 规则 2：已提交的测试任务**仍可**开重测任务，所以这里只看有没有失败用例，
 * 刻意不看 locked——它是终态唯一的出口，跟着一起灰掉就没路走了。
 */
function RetestItem({
	noFailed,
	onOpen,
}: {
	noFailed: boolean;
	onOpen: () => void;
}) {
	if (noFailed) {
		return <DisabledItem label="从失败用例创建" reason="没有失败的用例" />;
	}
	return <DropdownMenuItem onClick={onOpen}>从失败用例创建</DropdownMenuItem>;
}

/**
 * 规则 1 的另一半：已提交的测试任务不可删除（后端 CONFLICT）。
 * 这条理由尤其不能藏，因为用户看到它之后要么放弃，要么转去开一个重测任务——
 * 两条路都得他自己知道了才走得了。
 */
function DeleteItem({
	locked,
	onOpen,
}: {
	locked: boolean;
	onOpen: () => void;
}) {
	if (locked) {
		return <DisabledItem label="删除" reason={TEST_RUN_LOCKED_DELETE_HINT} />;
	}
	return (
		<DropdownMenuItem onClick={onOpen} variant="destructive">
			删除
		</DropdownMenuItem>
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
					<EditItem locked={locked} onEdit={handleEdit} />
					<RetestItem noFailed={noFailed} onOpen={openRetest} />
					<DeleteItem locked={locked} onOpen={openDelete} />
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
