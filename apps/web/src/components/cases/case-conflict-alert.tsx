/**
 * 乐观锁冲突的常驻提示条。
 *
 * 刻意不用 toast：409 冲突是最需要慢慢读、还要照着重做编辑的信息，
 * 而 toast 几秒后就从 DOM 里消失了。这里贴在详情面板内，直到用户自己关掉。
 */
import { Button } from "@automationstack/ui/components/button";
import { TriangleAlertIcon, XIcon } from "lucide-react";

import type { CaseSaveConflict } from "@/components/cases/use-case-mutations";

interface CaseConflictAlertProps {
	conflict: CaseSaveConflict | null;
	onDismiss: () => void;
}

export function CaseConflictAlert({
	conflict,
	onDismiss,
}: CaseConflictAlertProps) {
	if (!conflict) {
		return null;
	}

	return (
		<div
			className="flex items-start gap-2 border-destructive/40 border-b bg-destructive/10 px-4 py-2 text-destructive text-xs"
			role="alert"
		>
			<TriangleAlertIcon className="icon-stroke-regular mt-0.5 size-3.5 shrink-0" />
			<p className="flex-1">
				{`保存失败：用例已被 ${conflict.lastModifiedBy} 修改，服务端当前版本 v${conflict.currentVersion}。你的改动仍留在下方表单里，请先对照最新内容核对——再次保存会覆盖对方的修改。`}
			</p>
			<Button
				aria-label="关闭冲突提示"
				onClick={onDismiss}
				size="icon-xs"
				type="button"
				variant="ghost"
			>
				<XIcon />
			</Button>
		</div>
	);
}
