import { Sheet, SheetContent } from "@automationstack/ui/components/sheet";
import { useCallback, useState } from "react";

import { CaseCreateBody } from "@/components/cases/case-create-body";
import {
	UnsavedChangesDialog,
	useUnsavedCloseGuard,
	WIDE_SHEET_CONTENT_CLASS,
} from "@/components/wide-sheet-shell";

const CLOSE_CONFIRM_TITLE = "先不创建这条用例？";
const CLOSE_CONFIRM_DESCRIPTION =
	"已经写的内容会作为草稿留在这台电脑上，之后可以从侧栏的「未完成草稿」接着写。用例本身还没有创建。";
const CLOSE_CONFIRM_LABEL = "关闭并保留草稿";

interface CaseCreateSheetProps {
	draftId: string | undefined;
	moduleId: string | undefined;
	onClose: () => void;
	onCreated: (caseId: string) => void;
	open: boolean;
	projectId: string;
}

export function CaseCreateSheet(props: CaseCreateSheetProps) {
	const [dirty, setDirty] = useState(false);
	const open = props.open && props.moduleId !== undefined;
	const guard = useUnsavedCloseGuard(dirty, props.onClose);
	const requestClose = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	return (
		<>
			<Sheet onOpenChange={guard.handleOpenChange} open={open}>
				<SheetContent className={WIDE_SHEET_CONTENT_CLASS} side="right">
					{open && props.moduleId ? (
						<CaseCreateBody
							draftId={props.draftId}
							key={`${props.moduleId}:${props.draftId ?? "new"}`}
							moduleId={props.moduleId}
							onCancel={requestClose}
							onClose={props.onClose}
							onCreated={props.onCreated}
							onDirtyChange={setDirty}
							projectId={props.projectId}
						/>
					) : null}
				</SheetContent>
			</Sheet>
			<UnsavedChangesDialog
				confirmLabel={CLOSE_CONFIRM_LABEL}
				description={CLOSE_CONFIRM_DESCRIPTION}
				onCancel={guard.cancelClose}
				onConfirm={guard.confirmClose}
				open={guard.confirming}
				title={CLOSE_CONFIRM_TITLE}
			/>
		</>
	);
}
