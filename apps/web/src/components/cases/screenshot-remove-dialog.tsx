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

interface ScreenshotRemoveDialogProps {
	/** 这一组的名称，例如「操作截图」。 */
	groupLabel: string;
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
}

/** 删除一张截图前的确认。删除只改编辑区，保存用例时记录一个新版本。 */
export function ScreenshotRemoveDialog({
	groupLabel,
	onCancel,
	onConfirm,
	open,
}: ScreenshotRemoveDialogProps) {
	const handleOpenChange = useCloseOnDismiss(onCancel);
	return (
		<AlertDialog onOpenChange={handleOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{`删除这张${groupLabel}？`}</AlertDialogTitle>
					<AlertDialogDescription>
						保存用例后删除生效，并记录一个新版本。以前的版本仍然显示这张截图。
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
