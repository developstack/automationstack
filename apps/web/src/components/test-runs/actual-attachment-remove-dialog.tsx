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

import { useCloseOnDismiss } from "@/components/use-close-on-dismiss";

interface ActualAttachmentRemoveDialogProps {
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
}

/** 删除一个实际附件前的确认。删除立即生效，不能恢复。 */
export function ActualAttachmentRemoveDialog({
	onCancel,
	onConfirm,
	open,
}: ActualAttachmentRemoveDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onCancel);
	return (
		<AlertDialog onOpenChange={handleOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>删除这个实际附件？</AlertDialogTitle>
					<AlertDialogDescription>
						删除立即生效，其他人也不再看到这个文件，不能恢复。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} variant="destructive">
						删除
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
