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
	onStopEditing: () => void;
}

function CaseDetailActions({ editor, onStopEditing }: CaseDetailActionsProps) {
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
