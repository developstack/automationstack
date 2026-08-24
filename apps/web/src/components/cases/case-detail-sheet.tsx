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
import { useCallback, useEffect, useState } from "react";
import {
	CaseAttachmentProvider,
	useCaseAttachments,
	useCaseEditAttachments,
} from "@/components/cases/case-attachment-context";
import { CaseConflictAlert } from "@/components/cases/case-conflict-alert";
import { CaseDeleteButton } from "@/components/cases/case-delete-button";
import {
	CASE_EDITOR_FORM_ID,
	type CaseEditor,
	useCaseEditor,
} from "@/components/cases/case-detail-body";
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

interface CaseDetailActionsProps {
	editor: CaseEditor;
	/** 走守卫的「取消编辑」，不是 editor.stopEditing 本身。 */
	onStopEditing: () => void;
}

function CaseDetailActions({ editor, onStopEditing }: CaseDetailActionsProps) {
	/**
	 * 贴图还没传完时禁用保存。不禁的话，用户在上传完成前点保存，正文里的
	 * `![](uploading:<token>)` 会被原样存进去：抽屉退出编辑态之后，上传回来时
	 * 既找不到编辑器也找不到那份表单值，正文里就永久留下一处渲染成
	 * 「图片上传中…」的死引用，还会被冻进这次保存产生的版本快照。
	 * 第二道防线（回车绕过按钮）在 `case-detail-body.tsx` 的 handleSave 里。
	 */
	const { uploading } = useCaseAttachments();

	if (editor.form) {
		return (
			<div className="flex items-center gap-2">
				{uploading ? (
					<span className="text-muted-foreground text-xs">图片上传中…</span>
				) : null}
				<Button onClick={onStopEditing} size="sm" variant="ghost">
					取消
				</Button>
				<Button
					disabled={editor.saving || uploading}
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
	onStopEditing: () => void;
	testCase: TestCase;
}

function CaseDetailHeader({
	editor,
	onClose,
	onStopEditing,
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
				<CaseDetailActions editor={editor} onStopEditing={onStopEditing} />
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
