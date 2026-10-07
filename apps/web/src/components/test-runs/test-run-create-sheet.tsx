import { Button } from "@automationstack/ui/components/button";
import { Separator } from "@automationstack/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";

import { CasePicker } from "@/components/test-runs/case-picker";
import {
	type CreateRunController,
	useCreateRunDraft,
} from "@/components/test-runs/test-run-create-draft";
import { RunFields } from "@/components/test-runs/test-run-fields";
import {
	UnsavedChangesDialog,
	WIDE_SHEET_CONTENT_CLASS,
} from "@/components/wide-sheet-shell";

const CREATE_FORM_ID = "test-run-create-form";
const CREATE_HINT_ID = "test-run-create-hint";

interface CreateHeaderProps {
	blocked: boolean;
	hint: string | null;
	onCancel: () => void;
	pending: boolean;
}

function CreateHeader({ blocked, hint, onCancel, pending }: CreateHeaderProps) {
	return (
		<SheetHeader>
			<SheetTitle>新建测试任务</SheetTitle>
			<SheetDescription>填写名称并勾选这一轮要测的用例。</SheetDescription>
			<div className="flex flex-wrap items-center justify-end gap-2 pt-2">
				{hint === null ? null : (
					<p
						className="mr-auto text-muted-foreground text-sm"
						id={CREATE_HINT_ID}
					>
						{hint}
					</p>
				)}
				<Button onClick={onCancel} size="sm" type="button" variant="ghost">
					取消
				</Button>
				<Button
					aria-describedby={hint === null ? undefined : CREATE_HINT_ID}
					aria-disabled={blocked}
					form={CREATE_FORM_ID}
					size="sm"
					type="submit"
				>
					{pending ? "创建中…" : "创建"}
				</Button>
			</div>
		</SheetHeader>
	);
}

function CreateForm({
	controller,
	projectId,
}: {
	controller: CreateRunController;
	projectId: string;
}) {
	return (
		<form
			className="flex min-h-0 flex-1 flex-col gap-4 p-4"
			id={CREATE_FORM_ID}
			onSubmit={controller.handleSubmit}
		>
			<RunFields
				description={controller.draft.description}
				name={controller.draft.name}
				onDescriptionChange={controller.setDescription}
				onNameChange={controller.setName}
			/>
			<div className="flex min-h-0 flex-1 flex-col gap-2">
				<p className="font-medium text-sm">选择用例</p>
				<CasePicker
					onChange={controller.setCaseIds}
					projectId={projectId}
					selectedIds={controller.draft.caseIds}
				/>
			</div>
		</form>
	);
}

interface TestRunCreateSheetProps {
	onClose: () => void;
	open: boolean;
	projectId: string;
}

export function TestRunCreateSheet({
	onClose,
	open,
	projectId,
}: TestRunCreateSheetProps) {
	const controller = useCreateRunDraft(projectId, onClose);
	const { guard } = controller;

	return (
		<>
			<Sheet onOpenChange={guard.handleOpenChange} open={open}>
				<SheetContent className={WIDE_SHEET_CONTENT_CLASS} side="right">
					{open ? (
						<>
							<CreateHeader
								blocked={controller.blocked}
								hint={controller.hint}
								onCancel={controller.requestClose}
								pending={controller.pending}
							/>
							<Separator />
							<CreateForm controller={controller} projectId={projectId} />
						</>
					) : null}
				</SheetContent>
			</Sheet>
			<UnsavedChangesDialog
				onCancel={guard.cancelClose}
				onConfirm={guard.confirmClose}
				open={guard.confirming}
			/>
		</>
	);
}
