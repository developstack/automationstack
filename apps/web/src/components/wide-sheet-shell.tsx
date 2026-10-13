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

export const WIDE_SHEET_CONTENT_CLASS =
	"w-full! gap-0 p-0 text-sm sm:w-11/12! sm:max-w-7xl!";

export function useUnsavedCloseGuard(
	hasUnsavedChanges: boolean,
	onClose: () => void
) {
	const [confirming, setConfirming] = useState(false);

	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) {
				return;
			}
			if (hasUnsavedChanges) {
				setConfirming(true);
				return;
			}
			onClose();
		},
		[hasUnsavedChanges, onClose]
	);

	const cancelClose = useCallback(() => setConfirming(false), []);
	const confirmClose = useCallback(() => {
		setConfirming(false);
		onClose();
	}, [onClose]);

	return { cancelClose, confirmClose, confirming, handleOpenChange };
}

const DEFAULT_CONFIRM_LABEL = "放弃并关闭";
const DEFAULT_DESCRIPTION = "这个面板中还有未保存的修改，关闭后就找不回来了。";
const DEFAULT_TITLE = "放弃未保存的修改？";

interface UnsavedChangesDialogProps {
	confirmLabel?: string;
	description?: string;
	onCancel: () => void;
	onConfirm: () => void;
	open: boolean;
	title?: string;
}

export function UnsavedChangesDialog({
	confirmLabel = DEFAULT_CONFIRM_LABEL,
	description = DEFAULT_DESCRIPTION,
	onCancel,
	onConfirm,
	open,
	title = DEFAULT_TITLE,
}: UnsavedChangesDialogProps) {
	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (!nextOpen) {
				onCancel();
			}
		},
		[onCancel]
	);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>继续编辑</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} variant="destructive">
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
