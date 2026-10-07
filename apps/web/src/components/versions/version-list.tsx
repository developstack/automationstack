import { Badge } from "@automationstack/ui/components/badge";
import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { UndoIcon } from "lucide-react";
import { useCallback } from "react";

import { formatDateTime } from "@/components/cases/case-meta";

export interface CaseVersionRow {
	changeNote: string | null;
	createdAt: Date;
	savedBy: string | null;
	version: number;
}

export type VersionSelectionRole = "base" | "target";

interface VersionListItemProps {
	isCurrent: boolean;
	onRollback: (version: number) => void;
	onToggle: (version: number) => void;
	role: VersionSelectionRole | null;
	row: CaseVersionRow;
}

const ROLE_LABELS: Record<VersionSelectionRole, string> = {
	base: "基准",
	target: "对比",
};

interface VersionRowHeaderProps {
	isCurrent: boolean;
	role: VersionSelectionRole | null;
	row: CaseVersionRow;
}

function VersionRowHeader({ isCurrent, role, row }: VersionRowHeaderProps) {
	return (
		<div className="flex items-center gap-2">
			<Badge variant={role === null ? "secondary" : "default"}>
				v{row.version}
			</Badge>
			{isCurrent ? <Badge variant="outline">当前</Badge> : null}
			{role === null ? null : (
				<Badge variant="secondary">{ROLE_LABELS[role]}</Badge>
			)}
			<span className="ml-auto text-muted-foreground text-xs">
				{formatDateTime(row.createdAt)}
			</span>
		</div>
	);
}

function selectionLabel(
	row: CaseVersionRow,
	role: VersionSelectionRole | null
): string {
	return role === null
		? `选择版本 v${row.version} 进行查看或对比`
		: `取消选择版本 v${row.version}`;
}

function VersionListItem({
	isCurrent,
	onRollback,
	onToggle,
	role,
	row,
}: VersionListItemProps) {
	const handleToggle = useCallback(() => {
		onToggle(row.version);
	}, [onToggle, row.version]);
	const handleRollback = useCallback(() => {
		onRollback(row.version);
	}, [onRollback, row.version]);

	return (
		<li
			className={cn(
				"relative flex flex-col gap-1 rounded-md border p-2 transition-colors",
				role === null
					? "border-border hover:bg-muted/50"
					: "border-primary bg-accent"
			)}
		>
			<button
				aria-label={selectionLabel(row, role)}
				aria-pressed={role !== null}
				className="absolute inset-0 cursor-pointer rounded-md outline-none focus-visible:ring-1 focus-visible:ring-ring"
				onClick={handleToggle}
				type="button"
			/>
			<VersionRowHeader isCurrent={isCurrent} role={role} row={row} />
			<p className="truncate text-muted-foreground text-xs">
				{row.savedBy ?? "未知"} · {row.changeNote ?? "无备注"}
			</p>
			<Button
				className="relative self-start"
				disabled={isCurrent}
				onClick={handleRollback}
				size="xs"
				variant="outline"
			>
				<UndoIcon data-icon="inline-start" />
				回滚到此版本
			</Button>
		</li>
	);
}

interface VersionListProps {
	baseVersion: number | null;
	currentVersion: number;
	onRollback: (version: number) => void;
	onToggle: (version: number) => void;
	rows: readonly CaseVersionRow[];
	targetVersion: number | null;
}

function roleFor(
	version: number,
	baseVersion: number | null,
	targetVersion: number | null
): VersionSelectionRole | null {
	if (version === targetVersion) {
		return "target";
	}
	if (version === baseVersion) {
		return "base";
	}
	return null;
}

export function VersionList(props: VersionListProps) {
	const { baseVersion, currentVersion, onRollback, onToggle, rows } = props;
	return (
		<ul className="flex flex-col gap-2">
			{rows.map((row) => (
				<VersionListItem
					isCurrent={row.version === currentVersion}
					key={row.version}
					onRollback={onRollback}
					onToggle={onToggle}
					role={roleFor(row.version, baseVersion, props.targetVersion)}
					row={row}
				/>
			))}
		</ul>
	);
}
