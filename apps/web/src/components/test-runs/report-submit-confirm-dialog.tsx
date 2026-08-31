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

/**
 * 提交报告前的二次确认（从 report-submit-bar.tsx 拆出来）。
 */

interface SubmitConfirmProps {
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	pending: boolean;
	runName: string;
}

/**
 * 二次确认。文案必须把「不可逆」说完整——提交锁死的不只是这份报告的数字，
 * 而是整个测试任务的一切写操作（plan §2.5）。只写「提交后不可修改」会让人以为
 * 「不能改的是报告」，于是提交完才发现连补一张截图都不行。
 */
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
						提交后这个测试任务将永久锁定：结论、说明、附件、缺陷链接全部不可再修改，
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
