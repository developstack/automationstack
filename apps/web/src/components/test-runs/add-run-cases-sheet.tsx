import { Button } from "@automationstack/ui/components/button";
import { Separator } from "@automationstack/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";

import { useAddRunCasesDraft } from "@/components/test-runs/add-run-cases-draft";
import { CasePicker } from "@/components/test-runs/case-picker";
import {
	UnsavedChangesDialog,
	WIDE_SHEET_CONTENT_CLASS,
} from "@/components/wide-sheet-shell";

interface AddCasesHeaderProps {
	blocked: boolean;
	onCancel: () => void;
	onSubmit: () => void;
	pending: boolean;
}

function AddCasesHeader({
	blocked,
	onCancel,
	onSubmit,
	pending,
}: AddCasesHeaderProps) {
	return (
		<SheetHeader>
			<SheetTitle>追加用例</SheetTitle>
			<SheetDescription>
				新加进来的用例结论是「未测」，测试任务会自动退回「测试中」。
			</SheetDescription>
			<div className="flex flex-wrap items-center justify-end gap-2 pt-2">
				<Button onClick={onCancel} size="sm" type="button" variant="ghost">
					取消
				</Button>
				<Button
					aria-disabled={blocked}
					onClick={blocked ? undefined : onSubmit}
					size="sm"
					type="button"
				>
					{pending ? "追加中…" : "追加"}
				</Button>
			</div>
		</SheetHeader>
	);
}

interface AddRunCasesSheetProps {
	onClose: () => void;
	open: boolean;
	projectId: string;
	runId: string;
}

export function AddRunCasesSheet({
	onClose,
	open,
	projectId,
	runId,
}: AddRunCasesSheetProps) {
	const draft = useAddRunCasesDraft({ onClose, runId });

	return (
		<>
			<Sheet onOpenChange={draft.guard.handleOpenChange} open={open}>
				<SheetContent className={WIDE_SHEET_CONTENT_CLASS} side="right">
					{open ? (
						<>
							<AddCasesHeader
								blocked={draft.blocked}
								onCancel={draft.requestClose}
								onSubmit={draft.handleSubmit}
								pending={draft.pending}
							/>
							<Separator />
							<div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
								<CasePicker
									onChange={draft.setCaseIds}
									projectId={projectId}
									selectedIds={draft.caseIds}
								/>
							</div>
						</>
					) : null}
				</SheetContent>
			</Sheet>
			<UnsavedChangesDialog
				confirmLabel="放弃并关闭"
				description="这个抽屉里勾中的用例还没有追加进去，关掉就要重新挑一遍。"
				onCancel={draft.guard.cancelClose}
				onConfirm={draft.guard.confirmClose}
				open={draft.guard.confirming}
				title="放弃已勾选的用例？"
			/>
		</>
	);
}
