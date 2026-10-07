import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@automationstack/ui/components/dialog";

import {
	useRetestDraft,
	useRetestForm,
} from "@/components/test-runs/create-from-failed-draft";
import { CreateFromFailedForm } from "@/components/test-runs/create-from-failed-form";
import { UnsavedChangesDialog } from "@/components/wide-sheet-shell";

interface CreateFromFailedDialogProps {
	failedCount: number;
	onClose: () => void;
	open: boolean;
	sourceName: string;
	sourceRunId: string;
}

export function CreateFromFailedDialog({
	failedCount,
	onClose,
	open,
	sourceName,
	sourceRunId,
}: CreateFromFailedDialogProps) {
	const retest = useRetestDraft({ onClose, sourceName });
	const form = useRetestForm(retest, sourceRunId);

	return (
		<>
			<Dialog onOpenChange={retest.guard.handleOpenChange} open={open}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>从失败用例创建重测任务</DialogTitle>
						<DialogDescription>
							只复制失败的用例，结论全部重置为未测。
						</DialogDescription>
					</DialogHeader>
					{open ? (
						<CreateFromFailedForm
							draft={retest.draft}
							failedCount={failedCount}
							form={form}
							onCancel={retest.requestClose}
							sourceName={sourceName}
						/>
					) : null}
				</DialogContent>
			</Dialog>
			<UnsavedChangesDialog
				description="重测任务的名称或说明还没保存，关掉就要重填一遍。"
				onCancel={retest.guard.cancelClose}
				onConfirm={retest.guard.confirmClose}
				open={retest.guard.confirming}
			/>
		</>
	);
}
