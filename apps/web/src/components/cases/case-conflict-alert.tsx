import {
	Alert,
	AlertActions,
	AlertDescription,
	AlertTitle,
} from "@automationstack/ui/components/alert";
import { Button } from "@automationstack/ui/components/button";
import { HistoryIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import type { CaseSaveConflict } from "@/components/cases/use-case-mutations";

interface CaseConflictAlertProps {
	conflict: CaseSaveConflict | null;
	onDiscard: () => void;
	onDismiss: () => void;
	onOverwrite: () => void;
	onViewHistory: () => void;
	saving: boolean;
}

interface CaseConflictActionsProps {
	onDiscard: () => void;
	onOverwrite: () => void;
	onViewHistory: () => void;
	saving: boolean;
}

function CaseConflictActions({
	onDiscard,
	onOverwrite,
	onViewHistory,
	saving,
}: CaseConflictActionsProps) {
	return (
		<AlertActions>
			<Button onClick={onViewHistory} size="xs" type="button" variant="outline">
				<HistoryIcon data-icon="inline-start" />
				查看对方的修改
			</Button>
			<Button onClick={onDiscard} size="xs" type="button" variant="outline">
				放弃我的修改
			</Button>
			<Button
				onClick={onOverwrite}
				pending={saving}
				size="xs"
				type="button"
				variant="destructive"
			>
				用我的修改覆盖
			</Button>
		</AlertActions>
	);
}

/**
 * 其他人先保存时的冲突提示。说明表单中的修改没有丢失，并给出三个下一步：
 * 查看对方的修改、放弃自己的修改、用自己的修改覆盖。
 */
export function CaseConflictAlert({
	conflict,
	onDiscard,
	onDismiss,
	onOverwrite,
	onViewHistory,
	saving,
}: CaseConflictAlertProps) {
	if (!conflict) {
		return null;
	}

	return (
		<Alert className="pr-10" variant="destructive">
			<TriangleAlertIcon aria-hidden="true" />
			<AlertTitle>{`${conflict.lastModifiedBy} 先保存了 v${conflict.currentVersion}，你的修改没有保存`}</AlertTitle>
			<AlertDescription>
				<p>
					你的修改还在表单中。先查看对方改了什么，再决定放弃自己的修改，或者用自己的修改覆盖。覆盖后，对方的内容只能在版本历史中找到。
				</p>
			</AlertDescription>
			<CaseConflictActions
				onDiscard={onDiscard}
				onOverwrite={onOverwrite}
				onViewHistory={onViewHistory}
				saving={saving}
			/>
			<Button
				aria-label="关闭冲突提示"
				className="absolute top-2 right-2"
				onClick={onDismiss}
				size="icon-xs"
				type="button"
				variant="ghost"
			>
				<XIcon />
			</Button>
		</Alert>
	);
}
