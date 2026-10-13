import { Button } from "@automationstack/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { CaseListError } from "@/components/cases/case-list-error";
import { VersionHistorySkeleton } from "@/components/skeletons/version-history-skeleton";
import { orpc } from "@/utils/orpc";

import { HistoryEmpty } from "./history-empty.tsx";
import { VERSION_HISTORY_GRID_CLASS } from "./version-history-layout.ts";
import { VersionList } from "./version-list.tsx";
import {
	type CaseVersionRow,
	resolvePair,
	toggleSelection,
	type VersionPair,
} from "./version-pair.ts";
import { VersionRollbackDialog } from "./version-rollback-dialog.tsx";
import { VersionViewer } from "./version-viewer.tsx";

const EMPTY_ROWS: readonly CaseVersionRow[] = [];

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
	const handleRollbackClose = useCallback(() => {
		setRollbackTarget(null);
	}, []);
	return {
		handleRollbackClose,
		handleRollbackRequest: setRollbackTarget,
		rollbackTarget,
	};
}

/** 版本列表、选择的版本，以及由选择得出的查看或对比的版本。 */
function useVersionHistory(caseId: string, currentVersion: number) {
	const versionsQuery = useQuery(
		orpc.cases.listVersions.queryOptions({ input: { caseId } })
	);
	const selectionState = useVersionSelection();
	const rows: readonly CaseVersionRow[] = versionsQuery.data ?? EMPTY_ROWS;
	const pair = useMemo(
		() => resolvePair(selectionState.selection, rows, currentVersion),
		[currentVersion, rows, selectionState.selection]
	);
	return { pair, rows, selectionState, versionsQuery };
}

interface VersionSidebarProps {
	currentVersion: number;
	onReset: () => void;
	onRollback: (version: number) => void;
	onToggle: (version: number) => void;
	pair: VersionPair | null;
	rows: readonly CaseVersionRow[];
	selection: readonly number[];
}

function VersionSidebar(props: VersionSidebarProps) {
	return (
		<aside className="flex flex-col gap-2">
			<div className="flex min-h-6 items-center justify-between gap-2">
				<h3 className="eyebrow">
					{"版本 "}
					<span className="numeric">{props.rows.length}</span>
				</h3>
				{props.selection.length > 0 ? (
					<Button onClick={props.onReset} size="xs" variant="ghost">
						重置选择
					</Button>
				) : null}
			</div>
			<VersionList
				currentVersion={props.currentVersion}
				onRollback={props.onRollback}
				onToggle={props.onToggle}
				pair={props.pair}
				rows={props.rows}
				selection={props.selection}
			/>
			<p className="text-muted-foreground text-xs">
				选择一个版本查看内容，选择两个版本对比字段。
			</p>
		</aside>
	);
}

interface VersionHistoryPanelProps {
	caseId: string;
	currentVersion: number;
}

/**
 * 用例的版本历史：左侧版本列表，右侧快照查看或字段对比。
 * 没有选择版本时，对比当前版本和它的上一个版本。
 */
export function VersionHistoryPanel({
	caseId,
	currentVersion,
}: VersionHistoryPanelProps) {
	const { pair, rows, selectionState, versionsQuery } = useVersionHistory(
		caseId,
		currentVersion
	);
	const { handleReset, handleToggle, selection } = selectionState;
	const { handleRollbackClose, handleRollbackRequest, rollbackTarget } =
		useRollbackTarget();

	if (versionsQuery.isError && versionsQuery.data === undefined) {
		return <CaseListError query={versionsQuery} title="版本历史加载失败" />;
	}
	if (versionsQuery.isPending) {
		return <VersionHistorySkeleton />;
	}
	if (rows.length === 0) {
		return <HistoryEmpty />;
	}

	return (
		<div className={VERSION_HISTORY_GRID_CLASS}>
			<VersionSidebar
				currentVersion={currentVersion}
				onReset={handleReset}
				onRollback={handleRollbackRequest}
				onToggle={handleToggle}
				pair={pair}
				rows={rows}
				selection={selection}
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
				latestVersion={rows[0]?.version ?? currentVersion}
				onClose={handleRollbackClose}
				targetVersion={rollbackTarget}
			/>
		</div>
	);
}
