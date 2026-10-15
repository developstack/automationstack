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
import { CaseHeaderMeta } from "@/components/cases/case-header-meta";
import { formatDateTime } from "@/components/cases/case-meta";
import {
	CASE_SHEET_HEADER_CLASS,
	CASE_SHEET_TITLE_CLASS,
} from "@/components/cases/case-sheet-layout";
import { saveButtonLabel } from "@/components/cases/step-screenshot-save";

interface CaseDetailActionsProps {
	editor: CaseEditor;
	onStopEditing: () => void;
}

function CaseDetailActions({ editor, onStopEditing }: CaseDetailActionsProps) {
	const { screenshots, uploading } = useCaseAttachments();

	if (editor.form) {
		return (
			<div className="flex items-center gap-2">
				{uploading ? (
					<span className="text-muted-foreground text-xs" role="status">
						图片上传中…
					</span>
				) : null}
				<Button onClick={onStopEditing} size="sm" type="button" variant="ghost">
					取消
				</Button>
				<Button
					disabled={uploading}
					form={CASE_EDITOR_FORM_ID}
					pending={editor.saving}
					size="sm"
					type="submit"
				>
					{saveButtonLabel("保存", screenshots?.progress)}
				</Button>
			</div>
		);
	}

	return (
		<Button
			onClick={editor.startEditing}
			size="sm"
			type="button"
			variant="outline"
		>
			<PencilIcon data-icon="inline-start" />
			编辑
		</Button>
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
		<SheetHeader className={CASE_SHEET_HEADER_CLASS}>
			<CaseHeaderMeta
				caseId={testCase.id}
				priority={testCase.priority}
				status={testCase.status}
			/>
			<SheetTitle className={CASE_SHEET_TITLE_CLASS}>
				{testCase.name}
			</SheetTitle>
			<SheetDescription className="text-xs">
				<span className="numeric">{`v${testCase.currentVersion}`}</span>
				{" · 更新于 "}
				<span className="numeric">{formatDateTime(testCase.updatedAt)}</span>
			</SheetDescription>
			<div className="flex flex-wrap items-center justify-between gap-2 pt-1">
				<CaseDeleteButton caseId={testCase.id} onDeleted={onClose} />
				<CaseDetailActions editor={editor} onStopEditing={onStopEditing} />
			</div>
		</SheetHeader>
	);
}
