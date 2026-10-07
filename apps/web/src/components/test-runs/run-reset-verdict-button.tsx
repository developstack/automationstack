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
import { RotateCcwIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { resetWarning } from "@/components/test-runs/run-reset-impact";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface ResetConfirmDialogProps {
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	warning: string;
}

function ResetConfirmDialog({
	onConfirm,
	onOpenChange,
	open,
	warning,
}: ResetConfirmDialogProps) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>把这条用例打回未测？</AlertDialogTitle>
					<AlertDialogDescription>{warning}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} variant="destructive">
						打回未测
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export interface ResetVerdictButtonProps {
	canConclude: boolean;
	comment: string | null;
	onReset: () => void;
	stepResultCount: number;
}

export function ResetVerdictButton({
	canConclude,
	comment,
	onReset,
	stepResultCount,
}: ResetVerdictButtonProps) {
	const [open, setOpen] = useState(false);
	const close = useCallback(() => setOpen(false), []);
	const handleOpenChange = useCloseOnDismiss(close);
	const warning = resetWarning({ comment, stepResultCount });
	const handleClick = useCallback(() => {
		if (warning === null) {
			onReset();
			return;
		}
		setOpen(true);
	}, [onReset, warning]);
	const handleConfirm = useCallback(() => {
		setOpen(false);
		onReset();
	}, [onReset]);

	return (
		<>
			<Button
				aria-disabled={canConclude ? undefined : true}
				onClick={canConclude ? handleClick : undefined}
				size="sm"
				type="button"
				variant="outline"
			>
				<RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
				打回未测
			</Button>
			{warning === null ? null : (
				<ResetConfirmDialog
					onConfirm={handleConfirm}
					onOpenChange={handleOpenChange}
					open={open}
					warning={warning}
				/>
			)}
		</>
	);
}
