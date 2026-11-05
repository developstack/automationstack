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

interface SubmitConfirmProps {
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	pending: boolean;
	runName: string;
}

export function ReportSubmitConfirmDialog({
	onConfirm,
	onOpenChange,
	open,
	pending,
	runName,
}: SubmitConfirmProps) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{`提交「${runName}」的测试报告？`}</AlertDialogTitle>
					<AlertDialogDescription>
						提交后这个测试任务将永久锁定：结论、说明、附件全部不可再修改，
						也没有任何解锁入口。要继续测试只能新建重测任务。此操作不可撤销。
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>取消</AlertDialogCancel>
					<AlertDialogAction
						disabled={pending}
						onClick={onConfirm}
						variant="destructive"
					>
						提交并锁定
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
