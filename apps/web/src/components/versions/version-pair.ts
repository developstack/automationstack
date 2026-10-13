export interface CaseVersionRow {
	changeNote: string | null;
	createdAt: Date;
	savedBy: string | null;
	version: number;
}

/** 正在查看或对比的版本。base 是 null 时只查看 target 一个版本。 */
export interface VersionPair {
	base: number | null;
	target: number;
}

/** 一个版本在当前查看中的角色：对比的基准、对比的目标，或单独查看。 */
export type VersionSelectionRole = "base" | "target" | "view";

const MAX_SELECTED = 2;

/** 没有选择版本时，对比当前版本和它的上一个版本。 */
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

/** 选择两个版本时对比它们，旧版本是基准；选择一个版本时查看它。 */
export function resolvePair(
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

/** 选择或取消选择一个版本。已经选择两个版本时，最早选择的版本被替换。 */
export function toggleSelection(
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

export function roleFor(
	version: number,
	pair: VersionPair | null
): VersionSelectionRole | null {
	if (pair === null) {
		return null;
	}
	if (version === pair.target) {
		return pair.base === null ? "view" : "target";
	}
	if (version === pair.base) {
		return "base";
	}
	return null;
}
