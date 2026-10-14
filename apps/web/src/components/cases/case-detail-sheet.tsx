import { Sheet, SheetContent } from "@automationstack/ui/components/sheet";
import { useState } from "react";

import { CaseDetailContent } from "@/components/cases/case-detail-content";
import {
	UnsavedChangesDialog,
	useUnsavedCloseGuard,
	WIDE_SHEET_CONTENT_CLASS,
} from "@/components/wide-sheet-shell";

interface CaseDetailSheetProps {
	caseId: string | undefined;
	historyOpen: boolean;
	onClose: () => void;
	onToggleHistory: (open: boolean) => void;
}

export function CaseDetailSheet(props: CaseDetailSheetProps) {
	const [dirty, setDirty] = useState(false);
	const guard = useUnsavedCloseGuard(dirty, props.onClose);

	return (
		<>
			<Sheet
				onOpenChange={guard.handleOpenChange}
				open={props.caseId !== undefined}
			>
				<SheetContent className={WIDE_SHEET_CONTENT_CLASS} side="right">
					{props.caseId ? (
						<CaseDetailContent
							caseId={props.caseId}
							historyOpen={props.historyOpen}
							key={props.caseId}
							onClose={props.onClose}
							onDirtyChange={setDirty}
							onToggleHistory={props.onToggleHistory}
						/>
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
