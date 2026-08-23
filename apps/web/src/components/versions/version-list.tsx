/**
 * Version timeline for the history panel: one row per saved version,
 * click anywhere on the card to pick the two sides of a comparison, plus
 * the per-row rollback trigger.
 *
 * The whole card is the toggle, so the selection control is a transparent
 * button stretched over the card rather than the version chip alone —
 * the chip is a plain badge. The rollback button is lifted back above the
 * overlay with `relative` so it keeps its own click target.
 */
import { Badge } from "@automationstack/ui/components/badge";
import { Button } from "@automationstack/ui/components/button";
import { cn } from "@automationstack/ui/lib/utils";
import { UndoIcon } from "lucide-react";
import { useCallback } from "react";

import { formatDateTime } from "@/components/cases/case-meta";

/** Structural view of `cases.listVersions` rows (extra fields ignored). */
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

/** 说清楚点这张卡会发生什么——覆盖层本身没有可读文本。 */
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
			{/* 覆盖整张卡的选择热区：它是定位元素，所以盖在标题/备注之上接住点击。
			    圆角必须与外层 li 同档——inset-0 贴的是 padding box，差一档焦点环就会从边框上脱出来。 */}
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

/** Selectable list of a case's versions, newest first. */
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
