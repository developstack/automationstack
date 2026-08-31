/**
 * 详情抽屉的标题栏：用例名、乐观锁说明、删除按钮与编辑/保存那一组动作。
 *
 * 从 case-detail-sheet.tsx 拆出来（连同只服务于它的 CaseDetailActions），
 * 那边只留下抽屉外壳与内容装配。
 */
import type { TestCase } from "@automationstack/db/schema/test-cases";
import { Button } from "@automationstack/ui/components/button";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@automationstack/ui/components/sheet";
import { PencilIcon } from "lucide-react";

import { useCaseAttachments } from "@/components/cases/case-attachment-context";
import { CaseDeleteButton } from "@/components/cases/case-delete-button";
import {
	CASE_EDITOR_FORM_ID,
	type CaseEditor,
} from "@/components/cases/case-detail-body";

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

export function CaseDetailHeader({
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
