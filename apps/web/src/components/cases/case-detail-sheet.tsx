import type { TestCase } from "@automationstack/db/schema/test-cases";
import { Separator } from "@automationstack/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
	CaseAttachmentProvider,
	useCaseEditAttachments,
} from "@/components/cases/case-attachment-context";
import { CaseConflictAlert } from "@/components/cases/case-conflict-alert";
import {
	type CaseEditor,
	useCaseEditor,
} from "@/components/cases/case-detail-body";
import { CaseDetailHeader } from "@/components/cases/case-detail-header";
import { CaseDetailTabs } from "@/components/cases/case-detail-tabs";
import { isCaseFormDirty } from "@/components/cases/case-form-dirty";
import { caseToFormValues } from "@/components/cases/case-meta";
import {
	UnsavedChangesDialog,
	useUnsavedCloseGuard,
	WIDE_SHEET_CONTENT_CLASS,
} from "@/components/wide-sheet-shell";
import { CaseEditingNotice } from "@/realtime/editing-notice";
import { useCasePresence } from "@/realtime/use-editing";
import { orpc } from "@/utils/orpc";

function CaseDetailPending() {
	return (
		<SheetHeader>
			<SheetTitle>用例详情</SheetTitle>
			<SheetDescription>加载中…</SheetDescription>
		</SheetHeader>
	);
}

interface CaseDetailContentProps {
	caseId: string;
	historyOpen: boolean;
	onClose: () => void;
	onDirtyChange: (dirty: boolean) => void;
	onToggleHistory: (open: boolean) => void;
}

function useCaseDirtyGuard(
	editor: CaseEditor,
	testCase: TestCase | undefined,
	onDirtyChange: (dirty: boolean) => void
) {
	const dirty =
		testCase !== undefined &&
		isCaseFormDirty(editor.form, caseToFormValues(testCase));
	useEffect(() => {
		onDirtyChange(dirty);
		return () => onDirtyChange(false);
	}, [dirty, onDirtyChange]);

	const guard = useUnsavedCloseGuard(dirty, editor.stopEditing);
	const requestStopEditing = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	return { guard, requestStopEditing };
}

function CaseDetailContent(props: CaseDetailContentProps) {
	const { caseId, historyOpen, onClose, onDirtyChange, onToggleHistory } =
		props;
	const caseQuery = useQuery(
		orpc.cases.get.queryOptions({ input: { id: caseId } })
	);
	const testCase = caseQuery.data;
	const editor = useCaseEditor(caseId, testCase);
	const attachments = useCaseEditAttachments(caseId);
	useCasePresence(caseId, editor.form !== null);
	const { guard, requestStopEditing } = useCaseDirtyGuard(
		editor,
		testCase,
		onDirtyChange
	);

	if (!testCase) {
		return <CaseDetailPending />;
	}

	return (
		<CaseAttachmentProvider value={attachments}>
			<CaseDetailHeader
				editor={editor}
				onClose={onClose}
				onStopEditing={requestStopEditing}
				testCase={testCase}
			/>
			<CaseEditingNotice caseId={caseId} />
			<CaseConflictAlert
				conflict={editor.conflict}
				onDismiss={editor.clearConflict}
			/>
			<Separator />
			<CaseDetailTabs
				editor={editor}
				historyOpen={historyOpen}
				onToggleHistory={onToggleHistory}
				testCase={testCase}
			/>
			<UnsavedChangesDialog
				confirmLabel="放弃并退出编辑"
				description="这次编辑还有没保存的内容，退出编辑就找不回来了。抽屉不会关闭。"
				onCancel={guard.cancelClose}
				onConfirm={guard.confirmClose}
				open={guard.confirming}
			/>
		</CaseAttachmentProvider>
	);
}

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
