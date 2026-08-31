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
			{/*
			 * 描述那一行已经把「加载中」说出来了，下面不再压一块 h-40 的灰砖：
			 * 真身是一整份长短由内容决定的表单（标题、步骤、预期、标签、版本信息），
			 * 160px 既不等于它、也挡不住它到达时的位移，只是把一句已经说清楚的话
			 * 用一大块灰色再喊一遍。
			 */}
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

/**
 * 详情抽屉里两件与「未保存」有关的事，放在一起：
 * 1. 把 dirty 报给外层抽屉，供关闭前的二次确认使用；
 * 2. 「取消编辑」自己的守卫。useUnsavedCloseGuard 的第二个参数只是
 *    「确认之后要执行的那个破坏性动作」，与关闭无关——这里给的是
 *    editor.stopEditing，只把编辑态退回只读态。抽屉的 open 由
 *    CaseDetailSheet 的 props.caseId 决定，这条路径一个字都没碰它，
 *    所以确认「放弃并退出编辑」之后抽屉仍然留在原地。
 */
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
	// 软提示：抽屉一开就算「在看」，进编辑态再升级成「在改」
	// （冲突仍由乐观锁 409 兜底，这里不加锁）
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
		/*
		 * Provider 罩住整个内容（含标题栏），不只是编辑表单：标题栏的「保存」按钮
		 * 要读 `uploading` 才能在图没传完时禁用自己，而它在 <form> 外面。
		 */
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
