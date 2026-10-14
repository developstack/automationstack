import { VersionListItem } from "./version-list-item.tsx";
import {
	type CaseVersionRow,
	roleFor,
	type VersionPair,
} from "./version-pair.ts";

interface VersionListProps {
	currentVersion: number;
	onRollback: (version: number) => void;
	onToggle: (version: number) => void;
	pair: VersionPair | null;
	rows: readonly CaseVersionRow[];
	selection: readonly number[];
}

/** 版本列表，新版本在上。正在查看或对比的版本有左侧竖线和背景色。 */
export function VersionList({
	currentVersion,
	onRollback,
	onToggle,
	pair,
	rows,
	selection,
}: VersionListProps) {
	return (
		<ul
			aria-label="版本列表"
			className="divide-y overflow-hidden rounded-lg border"
		>
			{rows.map((row) => (
				<VersionListItem
					isCurrent={row.version === currentVersion}
					key={row.version}
					onRollback={onRollback}
					onToggle={onToggle}
					role={roleFor(row.version, pair)}
					row={row}
					selected={selection.includes(row.version)}
				/>
			))}
		</ul>
	);
}
