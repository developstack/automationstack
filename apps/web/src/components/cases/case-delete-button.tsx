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
import { Trash2Icon } from "lucide-react";
import { useCallback, useState } from "react";

import { useRemoveCase } from "@/components/cases/use-case-mutations";
import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface CaseDeleteButtonProps {
	caseId: string;
	caseName: string;
	onDeleted: () => void;
}

/** Destructive confirmation before removing a case and its version history. */
export function CaseDeleteButton({
	caseId,
	caseName,
	onDeleted,
}: CaseDeleteButtonProps) {
	const [open, setOpen] = useState(false);
	const close = useCallback(() => setOpen(false), []);
	const handleOpenChange = useCloseOnDismiss(close);
	const askConfirm = useCallback(() => setOpen(true), []);
	const remove = useRemoveCase(onDeleted);
	const handleConfirm = useCallback(
		() => remove.mutate({ id: caseId }),
		[caseId, remove]
	);

	return (
		<>
			<Button
				aria-label="删除用例"
				onClick={askConfirm}
				size="sm"
				variant="ghost"
			>
				<Trash2Icon data-icon="inline-start" />
				删除
			</Button>
			<AlertDialog onOpenChange={handleOpenChange} open={open}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>删除用例「{caseName}」？</AlertDialogTitle>
						<AlertDialogDescription>
							该用例及其版本历史将一并删除，且不可恢复。
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
		</>
	);
}
