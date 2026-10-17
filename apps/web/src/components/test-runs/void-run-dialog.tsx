import { VOID_REASON_MAX_LENGTH } from "@automationstack/api/schemas/test-run";
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
import { Label } from "@automationstack/ui/components/label";
import { Textarea } from "@automationstack/ui/components/textarea";
import { type ChangeEvent, useCallback, useState } from "react";

import { useVoidTestRun } from "@/components/test-runs/use-test-run-list-mutations";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

const REASON_FIELD_ID = "void-run-reason";

interface VoidReasonFieldProps {
	onChange: (value: string) => void;
	value: string;
}

function VoidReasonField({ onChange, value }: VoidReasonFieldProps) {
	const handleChange = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
		[onChange]
	);
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={REASON_FIELD_ID}>作废原因（选填）</Label>
			<Textarea
				id={REASON_FIELD_ID}
				maxLength={VOID_REASON_MAX_LENGTH}
				onChange={handleChange}
				value={value}
			/>
		</div>
	);
}

export interface VoidRunDialogProps {
	onClose: () => void;
	open: boolean;
	runId: string;
	runName: string;
}

export function VoidRunDialog({
	onClose,
	open,
	runId,
	runName,
}: VoidRunDialogProps) {
	const [reason, setReason] = useState("");
	const closeDialog = useCallback(() => {
		setReason("");
		onClose();
	}, [onClose]);
	const voidRun = useVoidTestRun(closeDialog);
	const handleOpenChange = useCloseOnDismiss(closeDialog);
	const handleConfirm = useCallback(() => {
		voidRun.mutate({ reason: reason.trim() || null, runId });
	}, [reason, runId, voidRun]);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>作废测试任务「{runName}」？</AlertDialogTitle>
					<AlertDialogDescription>
						作废后，测试任务保留在项目中，只能查看，不能修改，也不能恢复。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<VoidReasonField onChange={setReason} value={reason} />
				<AlertDialogFooter>
					<AlertDialogCancel>返回</AlertDialogCancel>
					<AlertDialogAction
						disabled={voidRun.isPending}
						onClick={handleConfirm}
						variant="destructive"
					>
						作废测试任务
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
