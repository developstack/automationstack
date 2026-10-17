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

interface CaseBatchDeleteButtonProps {
	count: number;
	onDelete: () => void;
}

/** 批量操作栏的「删除」：先弹窗确认已选条数，确认后删除。 */
export function CaseBatchDeleteButton({
	count,
	onDelete,
}: CaseBatchDeleteButtonProps) {
	const [open, setOpen] = useState(false);
	const openDialog = useCallback(() => setOpen(true), []);
	const handleConfirm = useCallback(() => {
		setOpen(false);
		onDelete();
	}, [onDelete]);

	return (
		<>
			<Button onClick={openDialog} size="sm" variant="outline">
				<Trash2Icon data-icon="inline-start" />
				删除
			</Button>
			<AlertDialog onOpenChange={setOpen} open={open}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							删除 <span className="numeric">{count}</span> 条用例？
						</AlertDialogTitle>
						<AlertDialogDescription>
							删除后用例和版本历史不可恢复。被测试任务用到的用例会跳过，可以改为废弃。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>取消</AlertDialogCancel>
						<AlertDialogAction onClick={handleConfirm} variant="destructive">
							删除
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
