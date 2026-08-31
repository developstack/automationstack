/**
 * Version history + diff panel — the single public entry point of this
 * folder. Lists a case's versions (`cases.listVersions`), lets the user
 * pick two of them, loads both snapshots (`cases.getVersion`) and feeds
 * them to the pure diff helpers. Defaults to "current vs previous".
 */
import { Button } from "@automationstack/ui/components/button";
import { Skeleton } from "@automationstack/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { orpc } from "@/utils/orpc";

import { HistoryEmpty } from "./history-empty.tsx";
import type { CaseVersionRow } from "./version-list.tsx";
import { VersionList } from "./version-list.tsx";
import { VersionRollbackDialog } from "./version-rollback-dialog.tsx";
import { VersionViewer } from "./version-viewer.tsx";

/** How many versions can take part in one comparison. */
const MAX_SELECTED = 2;

const EMPTY_ROWS: readonly CaseVersionRow[] = [];

interface VersionPair {
	base: number | null;
	target: number;
}

/** Newest version vs. the one saved right before it. */
function defaultPair(
	rows: readonly CaseVersionRow[],
	currentVersion: number
): VersionPair | null {
	if (rows.length === 0) {
		return null;
	}
	const found = rows.findIndex((row) => row.version === currentVersion);
	const targetIndex = found === -1 ? 0 : found;
	const target = rows.at(targetIndex);
	const base = rows.at(targetIndex + 1);
	return {
		base: base === undefined ? null : base.version,
		target: target === undefined ? currentVersion : target.version,
	};
}

function resolvePair(
	selection: readonly number[],
	rows: readonly CaseVersionRow[],
	currentVersion: number
): VersionPair | null {
	if (selection.length >= MAX_SELECTED) {
		const sorted = [...selection].sort((left, right) => left - right);
		return { base: sorted[0], target: sorted[1] };
	}
	if (selection.length === 1) {
		return { base: null, target: selection[0] };
	}
	return defaultPair(rows, currentVersion);
}

/** Keeps at most two picks; a third one drops the oldest pick. */
function toggleSelection(
	selection: readonly number[],
	version: number
): number[] {
	if (selection.includes(version)) {
		return selection.filter((item) => item !== version);
	}
	if (selection.length < MAX_SELECTED) {
		return [...selection, version];
	}
	return [...selection.slice(1), version];
}

interface VersionSidebarProps {
	currentVersion: number;
	onReset: () => void;
	onRollback: (version: number) => void;
	onToggle: (version: number) => void;
	pair: VersionPair | null;
	rows: readonly CaseVersionRow[];
	showReset: boolean;
}

function VersionSidebar(props: VersionSidebarProps) {
	return (
		<aside className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				{/* 面板标题已经由「版本历史」tab 提供，这里只标注左侧这一列 */}
				<h3 className="font-medium text-sm">版本列表</h3>
				{props.showReset ? (
					<Button onClick={props.onReset} size="xs" variant="ghost">
						重置选择
					</Button>
				) : null}
			</div>
			<VersionList
				baseVersion={props.pair?.base ?? null}
				currentVersion={props.currentVersion}
				onRollback={props.onRollback}
				onToggle={props.onToggle}
				rows={props.rows}
				targetVersion={props.pair?.target ?? null}
			/>
		</aside>
	);
}

function HistorySkeleton() {
	return (
		<div className="flex flex-col gap-2">
			<Skeleton className="h-5 w-24" />
			<Skeleton className="h-16 w-full" />
			<Skeleton className="h-16 w-full" />
		</div>
	);
}

function useVersionSelection() {
	const [selection, setSelection] = useState<readonly number[]>([]);
	const handleToggle = useCallback((version: number) => {
		setSelection((previous) => toggleSelection(previous, version));
	}, []);
	const handleReset = useCallback(() => {
		setSelection([]);
	}, []);
	return { handleReset, handleToggle, selection };
}

function useRollbackTarget() {
	const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
	const handleRollbackRequest = useCallback((version: number) => {
		setRollbackTarget(version);
	}, []);
	const handleRollbackClose = useCallback(() => {
		setRollbackTarget(null);
	}, []);
	return { handleRollbackClose, handleRollbackRequest, rollbackTarget };
}

interface VersionHistoryPanelProps {
	caseId: string;
	currentVersion: number;
}

/** Version history and diff view for one test case. */
export function VersionHistoryPanel({
	caseId,
	currentVersion,
}: VersionHistoryPanelProps) {
	const versionsQuery = useQuery(
		orpc.cases.listVersions.queryOptions({ input: { caseId } })
	);
	const { handleReset, handleToggle, selection } = useVersionSelection();
	const { handleRollbackClose, handleRollbackRequest, rollbackTarget } =
		useRollbackTarget();

	const rows: readonly CaseVersionRow[] = versionsQuery.data ?? EMPTY_ROWS;
	const pair = useMemo(
		() => resolvePair(selection, rows, currentVersion),
		[currentVersion, rows, selection]
	);

	if (versionsQuery.isPending) {
		return <HistorySkeleton />;
	}
	if (rows.length === 0) {
		return <HistoryEmpty />;
	}

	return (
		<div className="grid gap-4 md:grid-cols-3">
			<VersionSidebar
				currentVersion={currentVersion}
				onReset={handleReset}
				onRollback={handleRollbackRequest}
				onToggle={handleToggle}
				pair={pair}
				rows={rows}
				showReset={selection.length > 0}
			/>
			<div className="min-w-0 md:col-span-2">
				{pair === null ? null : (
					<VersionViewer
						baseVersion={pair.base}
						caseId={caseId}
						targetVersion={pair.target}
					/>
				)}
			</div>
			<VersionRollbackDialog
				caseId={caseId}
				onClose={handleRollbackClose}
				targetVersion={rollbackTarget}
			/>
		</div>
	);
}
