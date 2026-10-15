import type { TestCase } from "@automationstack/db/schema/test-cases";
import { Separator } from "@automationstack/ui/components/separator";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import {
	CaseAttachmentProvider,
	useCaseEditAttachments,
} from "@/components/cases/case-attachment-context";
import {
	type CaseEditor,
	useCaseEditor,
} from "@/components/cases/case-detail-body";
import { CaseDetailHeader } from "@/components/cases/case-detail-header";
import { CaseDetailNotices } from "@/components/cases/case-detail-notices";
import { CaseDetailPending } from "@/components/cases/case-detail-pending";
import { CaseDetailTabs } from "@/components/cases/case-detail-tabs";
import { isCaseFormDirty } from "@/components/cases/case-form-dirty";
import { caseToFormValues } from "@/components/cases/case-meta";
import { useBeforeUnloadWarning } from "@/components/interaction/use-before-unload-warning";
import {
	UnsavedChangesDialog,
	useUnsavedCloseGuard,
} from "@/components/wide-sheet-shell";
import { useCasePresence } from "@/realtime/use-editing";
import { orpc } from "@/utils/orpc";

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

	useBeforeUnloadWarning(dirty);
	const guard = useUnsavedCloseGuard(dirty, editor.stopEditing);
	const requestStopEditing = useCallback(
		() => guard.handleOpenChange(false),
		[guard.handleOpenChange]
	);

	return { guard, requestStopEditing };
}

/** 一条用例的详情、编辑状态、图片附件和在线状态。 */
function useCaseDetail(
	caseId: string,
	onDirtyChange: (dirty: boolean) => void
) {
	const caseQuery = useQuery(
		orpc.cases.get.queryOptions({ input: { id: caseId } })
	);
	const attachments = useCaseEditAttachments(caseId);
	const editor = useCaseEditor(caseId, caseQuery.data, attachments.screenshots);
	useCasePresence(caseId, editor.form !== null);
	const { guard, requestStopEditing } = useCaseDirtyGuard(
		editor,
		caseQuery.data,
		onDirtyChange
	);
	return { attachments, caseQuery, editor, guard, requestStopEditing };
}

interface CaseDetailContentProps {
	caseId: string;
	historyOpen: boolean;
	onClose: () => void;
	onDirtyChange: (dirty: boolean) => void;
	onToggleHistory: (open: boolean) => void;
}

export function CaseDetailContent(props: CaseDetailContentProps) {
	const { caseId, historyOpen, onClose, onDirtyChange, onToggleHistory } =
		props;
	const { attachments, caseQuery, editor, guard, requestStopEditing } =
		useCaseDetail(caseId, onDirtyChange);
	const testCase = caseQuery.data;
	const viewHistory = useCallback(
		() => onToggleHistory(true),
		[onToggleHistory]
	);

	if (!testCase) {
		return <CaseDetailPending query={caseQuery} />;
	}

	return (
		<CaseAttachmentProvider value={attachments}>
			<CaseDetailHeader
				editor={editor}
				onClose={onClose}
				onStopEditing={requestStopEditing}
				testCase={testCase}
			/>
			<CaseDetailNotices
				caseId={caseId}
				editor={editor}
				onViewHistory={viewHistory}
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
				description="这次编辑还有未保存的修改，退出编辑后就找不回来了。面板不会关闭。"
				onCancel={guard.cancelClose}
				onConfirm={guard.confirmClose}
				open={guard.confirming}
			/>
		</CaseAttachmentProvider>
	);
}
