import type { TestCase } from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import { Separator } from "@automationstack/ui/components/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { PencilIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { CaseConflictAlert } from "@/components/cases/case-conflict-alert";
import { CaseDeleteButton } from "@/components/cases/case-delete-button";
import {
	CASE_EDITOR_FORM_ID,
	type CaseEditor,
	useCaseEditor,
} from "@/components/cases/case-detail-body";
import { CaseDetailTabs } from "@/components/cases/case-detail-tabs";
import { caseToFormValues } from "@/components/cases/case-meta";
import {
	CASE_SHEET_CONTENT_CLASS,
	isCaseFormDirty,
	UnsavedChangesDialog,
	useUnsavedCloseGuard,
} from "@/components/cases/case-sheet-shell";
import { CaseEditingNotice } from "@/realtime/editing-notice";
import { useCasePresence } from "@/realtime/use-editing";
import { orpc } from "@/utils/orpc";

function CaseDetailActions({ editor }: { editor: CaseEditor }) {
	if (editor.form) {
		return (
			<div className="flex items-center gap-2">
				<Button onClick={editor.stopEditing} size="sm" variant="ghost">
					取消
				</Button>
				<Button
					disabled={editor.saving}
					form={CASE_EDITOR_FORM_ID}
					size="sm"
					type="submit"
				>
					{editor.saving ? "保存中…" : "保存"}
				</Button>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2">
			<Button onClick={editor.startEditing} size="sm" variant="outline">
				<PencilIcon data-icon="inline-start" />
				编辑
			</Button>
		</div>
	);
}

interface CaseDetailHeaderProps {
	editor: CaseEditor;
	onClose: () => void;
	testCase: TestCase;
}

function CaseDetailHeader({
	editor,
	onClose,
	testCase,
}: CaseDetailHeaderProps) {
	return (
		<SheetHeader>
			<SheetTitle>{testCase.name}</SheetTitle>
			<SheetDescription>
				保存时会基于 v{testCase.currentVersion} 做乐观锁校验。
			</SheetDescription>
			<div className="flex flex-wrap items-center justify-between gap-2 pt-2">
				<CaseDeleteButton
					caseId={testCase.id}
					caseName={testCase.name}
					onDeleted={onClose}
				/>
				<CaseDetailActions editor={editor} />
			</div>
		</SheetHeader>
	);
}

function CaseDetailPending() {
	return (
		<SheetHeader>
			<SheetTitle>用例详情</SheetTitle>
			<SheetDescription>加载中…</SheetDescription>
			<Skeleton className="h-40 w-full" />
		</SheetHeader>
	);
}

interface CaseDetailContentProps {
	caseId: string;
	historyOpen: boolean;
	onClose: () => void;
	/** 把「有未保存改动」报给抽屉，供关闭前的二次确认使用。 */
	onDirtyChange: (dirty: boolean) => void;
	onToggleHistory: (open: boolean) => void;
}

function CaseDetailContent(props: CaseDetailContentProps) {
	const { caseId, historyOpen, onClose, onDirtyChange, onToggleHistory } =
		props;
	const caseQuery = useQuery(
		orpc.cases.get.queryOptions({ input: { id: caseId } })
	);
	const testCase = caseQuery.data;
	const editor = useCaseEditor(caseId, testCase);
	// 软提示：抽屉一开就算「在看」，进编辑态再升级成「在改」
	// （冲突仍由乐观锁 409 兜底，这里不加锁）
	useCasePresence(caseId, editor.form !== null);

	const dirty =
		testCase !== undefined &&
		isCaseFormDirty(editor.form, caseToFormValues(testCase));
	useEffect(() => {
		onDirtyChange(dirty);
		return () => onDirtyChange(false);
	}, [dirty, onDirtyChange]);

	if (!testCase) {
		return <CaseDetailPending />;
	}

	return (
		<>
			<CaseDetailHeader editor={editor} onClose={onClose} testCase={testCase} />
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
		</>
	);
}

interface CaseDetailSheetProps {
	caseId: string | undefined;
	historyOpen: boolean;
	onClose: () => void;
	onToggleHistory: (open: boolean) => void;
}

/**
 * Wide right-hand sheet. The body is a two-tab shell (详情 / 版本历史) so the
 * history never stacks underneath the case content; the active tab mirrors the
 * `history` URL search param.
 */
export function CaseDetailSheet(props: CaseDetailSheetProps) {
	const [dirty, setDirty] = useState(false);
	const guard = useUnsavedCloseGuard(dirty, props.onClose);

	return (
		<>
			<Sheet
				onOpenChange={guard.handleOpenChange}
				open={props.caseId !== undefined}
			>
				<SheetContent className={CASE_SHEET_CONTENT_CLASS} side="right">
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
