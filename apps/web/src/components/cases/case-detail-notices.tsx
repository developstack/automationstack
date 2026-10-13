import { CaseConflictAlert } from "@/components/cases/case-conflict-alert";
import type { CaseEditor } from "@/components/cases/case-detail-body";
import { CaseEditingNotice } from "@/realtime/editing-notice";

interface CaseDetailNoticesProps {
	caseId: string;
	editor: CaseEditor;
	/** 面板中已经载入的用例版本 */
	latestVersion: number;
	onDiscard: () => void;
	onViewHistory: () => void;
}

/**
 * 头部和标签页之间的提示：其他人正在编辑、保存冲突。
 * 没有显示的提示时不占位置。
 */
export function CaseDetailNotices({
	caseId,
	editor,
	latestVersion,
	onDiscard,
	onViewHistory,
}: CaseDetailNoticesProps) {
	return (
		<div className="flex flex-col gap-2 px-4 has-data-[slot=alert]:pb-3">
			<CaseEditingNotice caseId={caseId} />
			<CaseConflictAlert
				conflict={editor.conflict}
				latestVersion={latestVersion}
				onDiscard={onDiscard}
				onDismiss={editor.clearConflict}
				onOverwrite={editor.handleSave}
				onViewHistory={onViewHistory}
				saving={editor.saving}
			/>
		</div>
	);
}
