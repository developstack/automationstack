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

import type { MindmapDeleteDialogState } from "./use-mindmap-sync.ts";

export function MindmapDeleteDialog({
	count,
	onCancel,
	onConfirm,
	open,
}: MindmapDeleteDialogState) {
	const handleOpenChange = useCloseOnDismiss(onCancel);

	return (
		<AlertDialog onOpenChange={handleOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>删除选中的 {count} 个节点？</AlertDialogTitle>
					<AlertDialogDescription>
						模块下的子模块与用例会一并删除，且不可恢复。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm} variant="destructive">
						删除
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
