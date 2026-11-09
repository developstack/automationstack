import { canVoidTestRun } from "@automationstack/api/lib/test-run-access";
import { isTestRunVoidable } from "@automationstack/db/repositories/test-run-status-core";
import type { TestRunListItem } from "@automationstack/db/repositories/test-runs-repository";
import { useCallback, useState } from "react";

import { CreateFromFailedDialog } from "@/components/test-runs/create-from-failed-dialog";
import { isTestRunLocked } from "@/components/test-runs/test-run-rates";
import { TestRunRowActionsMenu } from "@/components/test-runs/test-run-row-actions-menu";
import { useRunViewer } from "@/components/test-runs/use-run-viewer";
import { VoidRunDialog } from "@/components/test-runs/void-run-dialog";

function useDialogToggle(): [boolean, () => void, () => void] {
	const [open, setOpen] = useState(false);
	const show = useCallback(() => setOpen(true), []);
	const hide = useCallback(() => setOpen(false), []);
	return [open, show, hide];
}

interface TestRunRowActionsProps {
	item: TestRunListItem;
	onEdit: (runId: string) => void;
}

export function TestRunRowActions({ item, onEdit }: TestRunRowActionsProps) {
	const { counts, run } = item;
	const [retesting, openRetest, closeRetest] = useDialogToggle();
	const [voiding, openVoid, closeVoid] = useDialogToggle();
	const viewer = useRunViewer();
	// 不能用的操作不放进菜单。已提交和已作废的测试任务不能编辑。
	const locked = isTestRunLocked(run.status);
	const canRetest = counts.failed > 0;
	// 与服务端用同一条规则：状态允许，并且是创建者或管理员。
	const canVoid =
		viewer !== null &&
		isTestRunVoidable(run.status) &&
		canVoidTestRun(viewer, run.createdBy);
	const handleEdit = useCallback(() => onEdit(run.id), [onEdit, run.id]);

	// 一项都不能用时，不显示「更多操作」按钮。
	if (locked && !canRetest) {
		return null;
	}

	return (
		<>
			<TestRunRowActionsMenu
				canEdit={!locked}
				canRetest={canRetest}
				canVoid={canVoid}
				onEdit={handleEdit}
				onRetest={openRetest}
				onVoid={openVoid}
				runName={run.name}
			/>
			<VoidRunDialog
				onClose={closeVoid}
				open={voiding}
				runId={run.id}
				runName={run.name}
			/>
			<CreateFromFailedDialog
				failedCount={counts.failed}
				onClose={closeRetest}
				open={retesting}
				sourceName={run.name}
				sourceRunId={run.id}
			/>
		</>
	);
}
