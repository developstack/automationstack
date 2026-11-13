import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { useCallback } from "react";

import type { CaseVersionRow, VersionSelectionRole } from "./version-pair.ts";
import { VersionRollbackButton } from "./version-rollback-button.tsx";
import { VersionRowSummary } from "./version-row-summary.tsx";

interface VersionListItemProps {
	isCurrent: boolean;
	onRollback: (version: number) => void;
	onToggle: (version: number) => void;
	role: VersionSelectionRole | null;
	row: CaseVersionRow;
	selected: boolean;
}

/**
 * 版本列表的一行。整行是一个按钮，按下后选择或取消选择这个版本；
 * 回滚按钮在它的上层，当前版本没有回滚按钮。
 */
export function VersionListItem({
	isCurrent,
	onRollback,
	onToggle,
	role,
	row,
	selected,
}: VersionListItemProps) {
	const handleToggle = useCallback(() => {
		onToggle(row.version);
	}, [onToggle, row.version]);
	const rollbackButton = isCurrent ? null : (
		<VersionRollbackButton onRollback={onRollback} version={row.version} />
	);

	return (
		<li
			className={cn(
				"relative flex flex-col gap-1 py-2.5 pr-2 pl-4 transition-control",
				role === null ? "hover:bg-muted/50" : "bg-muted"
			)}
		>
			{role === null ? null : (
				<span
					aria-hidden="true"
					className="absolute inset-y-2 left-1 w-0.5 rounded-full bg-foreground"
				/>
			)}
			<Button
				aria-label={
					selected
						? `取消选择 v${row.version}`
						: `选择 v${row.version} 查看或对比`
				}
				aria-pressed={selected}
				className="absolute inset-0 cursor-pointer rounded-none p-0 outline-none transition-focus-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
				onClick={handleToggle}
				type="button"
				variant="plain"
			/>
			<VersionRowSummary
				action={rollbackButton}
				isCurrent={isCurrent}
				role={role}
				row={row}
			/>
		</li>
	);
}
